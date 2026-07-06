Unicode true
SetCompressor /SOLID lzma

!ifndef APP_NAME
  !define APP_NAME "Maven Settings Management"
!endif

!ifndef APP_VERSION
  !define APP_VERSION "0.1.0"
!endif

!ifndef APP_VERSION_QUAD
  !define APP_VERSION_QUAD "0.1.0.0"
!endif

!ifndef APP_PUBLISHER
  !define APP_PUBLISHER "Local"
!endif

!ifndef APP_EXE
  !define APP_EXE "../../src-tauri/target/x86_64-pc-windows-msvc/release/mvn-settings-management.exe"
!endif

!ifndef APP_ICON
  !define APP_ICON "../../src-tauri/icons/icon.ico"
!endif

!ifndef OUT_FILE
  !define OUT_FILE "../../src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Maven Settings Management_0.1.0_x64-setup.exe"
!endif

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
RequestExecutionLevel user

Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"

VIProductVersion "${APP_VERSION_QUAD}"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION_QUAD}"
VIAddVersionKey "ProductVersion" "${APP_VERSION_QUAD}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 ${APP_PUBLISHER}"

Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File "/oname=mvn-settings-management.exe" "${APP_EXE}"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\mvn-settings-management.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\mvn-settings-management.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\mvn-settings-management.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  Delete "$INSTDIR\mvn-settings-management.exe"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
