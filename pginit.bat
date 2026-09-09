@echo off
"C:\Program Files\PostgreSQL\16\bin\initdb.exe" -D C:\pgdata -U postgres -E UTF8 --locale=C -A scram-sha-256 --pwfile=C:\pg-pw.txt > C:\Users\Administrator\Desktop\udp\pginit.log 2>&1
