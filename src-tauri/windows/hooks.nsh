; Sepela ERP — NSIS installer hooks (see docs/DEPLOYMENT.md)

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Sepela ERP" "InstallCompleted" "1"
  WriteRegStr HKCU "Software\Sepela ERP" "EulaAcceptedAtInstall" "1"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Sepela ERP"
!macroend
