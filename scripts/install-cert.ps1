$certPath = Join-Path $PSScriptRoot "..\ssl\certificate.crt"
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
try {
    $store.Open("ReadWrite")
    $store.Add($cert)
    Write-Host "Certificate installed successfully in Trusted Root Certification Authorities store."
} catch {
    Write-Host "Error installing certificate: $_"
} finally {
    $store.Close()
}
