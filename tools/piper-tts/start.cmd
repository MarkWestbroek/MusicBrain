@echo off
rem De spraakdienst voor het Zang-venster, op je eigen computer.
rem Eenmalig inrichten: zie README.md (venv + stemmen).
cd /d "%~dp0..\.."
tools\piper-tts\.venv\Scripts\python.exe tools\piper-tts\server.py --open --cors "*" %*
