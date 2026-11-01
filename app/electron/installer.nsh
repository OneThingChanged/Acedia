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
