' Liga a Cartoon TV sem piscar console
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\lucas\Documents\Claude\Local - Lucas Agostini\Main - 01\cartoon-tv\televisor"
sh.Run "cmd /c node tv.js >> tv-log.txt 2>&1", 0, False
