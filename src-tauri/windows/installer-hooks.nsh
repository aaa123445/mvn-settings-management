!macro RefreshShortcutIcon SHORTCUT_PATH
  ${If} ${FileExists} "${SHORTCUT_PATH}"
    Delete "${SHORTCUT_PATH}"
    CreateShortcut "${SHORTCUT_PATH}" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
    !insertmacro SetLnkAppUserModelId "${SHORTCUT_PATH}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !if "${STARTMENUFOLDER}" != ""
    !insertmacro RefreshShortcutIcon "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !endif
  !insertmacro RefreshShortcutIcon "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !insertmacro RefreshShortcutIcon "$DESKTOP\${PRODUCTNAME}.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
