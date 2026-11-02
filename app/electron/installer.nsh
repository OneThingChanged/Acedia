!macro preInit
  !ifndef BUILD_UNINSTALLER
    ; Let release checks run the real NSIS CRC/header loader without installing
    ; or touching an existing Acedia process, profile or uninstall registration.
    ${GetParameters} $R8
    ClearErrors
    ${GetOptions} $R8 "/ACEDIA_VERIFY_INSTALLER" $R9
    ${IfNot} ${Errors}
      SetErrorLevel 73
      Quit
    ${EndIf}
  !endif
!macroend

!macro customInit
  ; Preserve the registered location during an update. Fresh installs used to
  ; inherit package.json's internal name (`app`) and landed in Programs\app.
  ; Use the user-facing executable name for new standard and Company installs.
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R9 == ""
    StrCpy $INSTDIR "$LocalAppData\Programs\${PRODUCT_FILENAME}"
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove only this installation channel's opt-in login entry.
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
  ${endIf}
!macroend
