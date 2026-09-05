; The backend has an app-specific process name, so it is safe to stop without
; touching Node.js processes that belong to the user's other applications.
!macro NSIS_HOOK_PREINSTALL
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::KillProcessCurrentUser "seoautopilot-node.exe"
  !else
    nsis_tauri_utils::KillProcess "seoautopilot-node.exe"
  !endif
  Pop $R0
  Sleep 500
!macroend
