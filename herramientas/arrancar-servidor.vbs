' ══════════════════════════════════════════════════════════════════════
'  arrancar-servidor.vbs — llama al .bat SIN ventana negra
' ══════════════════════════════════════════════════════════════════════
'
'  El .bat hace el trabajo. Esto solo existe para que no quede una ventana
'  de consola abierta en el escritorio todo el dia: la cerraria cualquiera
'  sin saber que estaba apagando el sistema, que es justo lo que se quiere
'  evitar.
'
'  El 0 del Run es "oculto" y el False es "no esperes a que termine" —el
'  servidor no termina nunca.
'
'  La ruta se calcula desde este propio archivo: el proyecto tiene tildes
'  en el nombre y escribirla a mano es pedir que se rompa.
' ══════════════════════════════════════════════════════════════════════

Dim shell, fso, aqui, bat
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

aqui = fso.GetParentFolderName(WScript.ScriptFullName)
bat = fso.BuildPath(aqui, "arrancar-servidor.bat")

If Not fso.FileExists(bat) Then
  WScript.Quit 1
End If

shell.Run """" & bat & """", 0, False
