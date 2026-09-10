' Liga a Cartoon TV sem piscar console e abre o controle junto, assim que ela entra no ar.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)

' Devolve o corpo da resposta de /estado (qualquer status), ou "" se ninguem respondeu.
Function RespostaEstado()
  RespostaEstado = ""
  On Error Resume Next
  Set req = CreateObject("MSXML2.XMLHTTP")
  req.Open "GET", "http://127.0.0.1:4599/estado", False
  req.Send
  If Err.Number = 0 Then RespostaEstado = req.responseText
  Err.Clear
  On Error Goto 0
End Function

Function TvNoAr()
  TvNoAr = InStr(RespostaEstado(), """ligada"":true") > 0
End Function

' Alguem respondeu, mas nao e a TV (a resposta nem tem "ligada"): outro programa esta na porta.
' Aconteceu em 10/09/2026 com um servidor de preview de outro projeto - a janelinha abria a
' pagina errada. O Windows deixa a TV subir em 0.0.0.0 mesmo com 127.0.0.1 ocupado.
Function Intruso()
  resp = RespostaEstado()
  Intruso = (resp <> "" And InStr(resp, """ligada""") = 0)
End Function

' Usa o Node que vem junto na instalacao; so cai pro Node do sistema se nao houver.
' (o instalador embute node.exe pra pessoa nao precisar instalar nada)
Set fso2 = CreateObject("Scripting.FileSystemObject")
nodeExe = "node"
If fso2.FileExists(base & "\node.exe") Then nodeExe = """" & base & "\node.exe"""

sh.CurrentDirectory = base & "\televisor"
sh.Run "cmd /c " & nodeExe & " tv.js >> tv-log.txt 2>&1", 0, False

' Espera a TV entrar no ar de verdade antes de abrir o controle. Abrir antes faria a
' janelinha nascer mostrando "TV desligada" — o servidor sobe antes do 1o programa.
For i = 1 To 60
  If TvNoAr() Then Exit For
  If Intruso() Then Exit For
  WScript.Sleep 1000
Next

If Intruso() Then
  MsgBox "A porta 4599 esta ocupada por outro programa, entao o controle nao consegue falar com a TV." & vbCrLf & vbCrLf & _
         "Feche o outro programa (no terminal: netstat -ano | findstr :4599 mostra o PID) e abra o controle de novo." & vbCrLf & _
         "Nao precisa religar a TV.", vbExclamation, "Cartoon TV - Controle"
  WScript.Quit
End If

' Abre a janelinha DIRETO, nao via abrir-controle.vbs: aquele script liga a TV quando nao
' a encontra, entao chama-lo daqui poderia render duas instancias.
perfil = base & "\televisor\.chrome-controle"
On Error Resume Next
chrome = sh.RegRead("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
On Error Goto 0
If chrome <> "" Then
  sh.Run """" & chrome & """ --app=http://127.0.0.1:4599/ --user-data-dir=""" & perfil & _
         """ --window-size=400,700 --no-first-run --no-default-browser-check --disable-features=Translate", 1, False
End If
