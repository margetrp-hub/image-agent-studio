package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
)

type providerLookupFunc func(context.Context, string) ([]net.IPAddr, error)
type providerDialFunc func(context.Context, string, string) (net.Conn, error)

var nonPublicProviderPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
}

func newPersonalProviderHTTPClient(ctx context.Context, endpoint string, allowPrivate bool) (*http.Client, error) {
	dialer := &net.Dialer{}
	return newPersonalProviderHTTPClientWithNetwork(
		ctx,
		endpoint,
		allowPrivate,
		net.DefaultResolver.LookupIPAddr,
		dialer.DialContext,
	)
}

func newPersonalProviderHTTPClientWithNetwork(
	ctx context.Context,
	endpoint string,
	allowPrivate bool,
	lookup providerLookupFunc,
	dial providerDialFunc,
) (*http.Client, error) {
	target, addresses, err := resolvePersonalProviderTarget(ctx, endpoint, allowPrivate, lookup)
	if err != nil {
		return nil, err
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DisableKeepAlives = true
	transport.DialContext = pinnedProviderDialer(target, addresses, dial)
	return &http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

func resolvePersonalProviderTarget(
	ctx context.Context,
	endpoint string,
	allowPrivate bool,
	lookup providerLookupFunc,
) (*url.URL, []net.IPAddr, error) {
	target, err := url.Parse(endpoint)
	if err != nil || target.User != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Hostname() == "" {
		return nil, nil, errors.New("invalid provider URL")
	}

	host := strings.TrimSuffix(strings.ToLower(target.Hostname()), ".")
	if !allowPrivate && (host == "localhost" || strings.HasSuffix(host, ".localhost") || host == "metadata.google.internal") {
		return nil, nil, errors.New("private provider URL")
	}

	var addresses []net.IPAddr
	if ip := net.ParseIP(host); ip != nil {
		addresses = []net.IPAddr{{IP: ip}}
	} else {
		addresses, err = lookup(ctx, host)
		if err != nil || len(addresses) == 0 {
			return nil, nil, errors.New("provider host did not resolve")
		}
	}
	for _, address := range addresses {
		if address.IP == nil || (!allowPrivate && isNonPublicProviderIP(address.IP)) {
			return nil, nil, errors.New("private provider URL")
		}
	}
	return target, addresses, nil
}

func pinnedProviderDialer(target *url.URL, addresses []net.IPAddr, dial providerDialFunc) providerDialFunc {
	targetHost := strings.TrimSuffix(strings.ToLower(target.Hostname()), ".")
	targetPort := target.Port()
	if targetPort == "" {
		if target.Scheme == "https" {
			targetPort = "443"
		} else {
			targetPort = "80"
		}
	}

	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil || strings.TrimSuffix(strings.ToLower(host), ".") != targetHost || port != targetPort {
			return nil, errors.New("provider dial target changed")
		}

		var lastErr error
		for _, resolved := range addresses {
			pinnedAddress := net.JoinHostPort(resolved.IP.String(), targetPort)
			connection, dialErr := dial(ctx, network, pinnedAddress)
			if dialErr == nil {
				return connection, nil
			}
			lastErr = dialErr
		}
		if lastErr == nil {
			lastErr = errors.New("provider host did not resolve")
		}
		return nil, lastErr
	}
}

func isNonPublicProviderIP(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return true
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() || address.IsMulticast() || address.IsUnspecified() {
		return true
	}
	for _, prefix := range nonPublicProviderPrefixes {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}
