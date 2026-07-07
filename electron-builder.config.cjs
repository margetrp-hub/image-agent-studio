module.exports = {
  appId: 'com.margetrp.imageagentstudio',
  productName: 'Image Agent Studio',
  directories: {
    output: 'release/desktop'
  },
  files: [
    'apps/desktop/main.mjs',
    'dist/**',
    'scripts/image-agent-studio-history-service.mjs',
    'scripts/studio-service/**',
    'package.json'
  ],
  extraMetadata: {
    main: 'apps/desktop/main.mjs'
  },
  asar: true,
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ]
  },
  portable: {
    artifactName: '${productName}-${version}-${arch}-portable.${ext}'
  },
  nsis: {
    artifactName: '${productName}-${version}-${arch}-setup.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false
  }
};
