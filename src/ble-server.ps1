param (
    [string]$PayloadJson = "{}"
)

# Chargement des assemblages .NET et WinRT nécessaires
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProvider, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

# Fonction utilitaire pour convertir une opération asynchrone WinRT en tâche .NET standard
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRT($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

$ServiceUuid = [Guid]"12345678-1234-5678-1234-56789abcdef0"
$CharUuid = [Guid]"12345678-1234-5678-1234-56789abcdef1"

# Création du fournisseur de service GATT
$asyncOp = [Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProvider]::CreateAsync($ServiceUuid)
$result = Await-WinRT $asyncOp ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProviderResult])

if ($result.Error -ne 'Success') {
    Write-Error "Erreur Bluetooth Windows : $($result.Error)"
    exit 1
}

$serviceProvider = $result.ServiceProvider

# Configuration de la caractéristique en lecture seule
$charParams = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattLocalCharacteristicParameters
$charParams.CharacteristicProperties = [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Read
$charParams.ReadProtectionLevel = [Windows.Devices.Bluetooth.GenericAttributeProfile.GattProtectionLevel]::Plain

# Préparation des données JSON chiffrées
$bytes = [System.Text.Encoding]::UTF8.GetBytes($PayloadJson)
$charParams.StaticValue = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)


$charOp = $serviceProvider.Service.CreateCharacteristicAsync($CharUuid, $charParams)
$charResult = Await-WinRT $charOp ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattLocalCharacteristicResult])

# Démarrage de la diffusion BLE (Advertising)
$advParams = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProviderAdvertisingParameters
$advParams.IsDiscoverable = $true
$advParams.IsConnectable = $true

$serviceProvider.StartAdvertising($advParams)
Write-Output "READY"

# Maintenir le service actif jusqu'à l'arrêt
while ($true) {
    Start-Sleep -Seconds 1
}
