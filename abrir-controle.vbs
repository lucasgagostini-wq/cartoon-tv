' Abre a janelinha de controle. Se a TV estiver desligada, liga antes e espera o servidor subir.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

' Espera "ligada":true, nao so HTTP 200. O servidor sobe ANTES do primeiro programa
' entrar no ar; abrir a janelinha nesse intervalo faria ela nascer mostrando
' "TV desligada" (medido 29/07).
Function TvNoAr()
  TvNoAr = False
  On Error Resume Next
  Set req = CreateObject("MSXML2.XMLHTTP")
  req.Open "GET", "http://127.0.0.1:4599/estado", False
  req.Send
  If Err.Number = 0 And req.Status = 200 Then
    If InStr(req.responseText, """ligada"":true") > 0 Then TvNoAr = True
  End If
  Err.Clear
  On Error Goto 0
End Function

Function ServidorNoAr()
  ServidorNoAr = False
  On Error Resume Next
  Set req2 = CreateObject("MSXML2.XMLHTTP")
  req2.Open "GET", "http://127.0.0.1:4599/estado", False
  req2.Send
  If Err.Number = 0 And req2.Status = 200 Then ServidorNoAr = True
  Err.Clear
  On Error Goto 0
End Function

If Not ServidorNoAr() Then
  sh.Run "wscript.exe //nologo """ & base & "\ligar-tv.vbs""", 0, False
End If

For i = 1 To 60              ' ate 60s esperando a TV entrar no ar de verdade
  If TvNoAr() Then Exit For
  WScript.Sleep 1000
Next

perfil = base & "\televisor\.chrome-controle"
chrome = sh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
sh.Run """" & chrome & """ --app=http://127.0.0.1:4599/ --user-data-dir=""" & perfil & _
       """ --window-size=400,700 --no-first-run --no-default-browser-check --disable-features=Translate", 1, False
