import { useCallback, useEffect, useRef } from 'react';

export function useUnsavedProviderChanges(dirty) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true;
    if (!window.confirm('有未保存的供应商或定价修改。放弃修改？')) return false;
    dirtyRef.current = false;
    return true;
  }, []);
  useEffect(() => {
    let currentHash = window.location.hash;
    const beforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event) => {
      const target = event.target.closest?.('.iasAdminNavigation a, .iasAdminBrand, .iasSidebarFoot a, [aria-label="退出登录"]');
      if (!target || target.getAttribute('aria-current') === 'page') return;
      if (!confirmDiscard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const hashChange = (event) => {
      if (!confirmDiscard()) {
        event.stopImmediatePropagation();
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${currentHash}`);
      } else currentHash = window.location.hash;
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    window.addEventListener('hashchange', hashChange, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
      window.removeEventListener('hashchange', hashChange, true);
    };
  }, [confirmDiscard]);
  return confirmDiscard;
}
