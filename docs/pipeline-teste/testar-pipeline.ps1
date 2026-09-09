# Teste do nosso pipeline de image-edit via fal.ai (Nano Banana / Flux Kontext)
# Roda as mesmas 5 acoes que testamos na Pedra (mobiliar, esvaziar, trocar piso,
# trocar ceu, melhorar), com as mesmas fotos, para comparar qualidade e velocidade.
#
# CUSTO ESTIMADO: ~US$ 0,28 (7 chamadas: 5x Nano Banana ~US$0,039 + 2x Flux Kontext US$0,04)
#
# COMO USAR
# 1. Crie uma conta em https://fal.ai e gere uma chave de API em https://fal.ai/dashboard/keys
# 2. Salve a chave (só ela, nada mais) num arquivo local:
#      docs/pipeline-teste/fal_key.txt
#    Esse arquivo NAO deve ser mostrado nem lido em conversa nenhuma -- so o script le.
# 3. Rode este script: powershell -File docs/pipeline-teste/testar-pipeline.ps1
# 4. Resultados ficam em docs/pipeline-teste/resultados/ e docs/pipeline-teste/resultados.csv

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$keyPath = Join-Path $root "fal_key.txt"
$fotosDir = Join-Path (Split-Path -Parent $root) "pedra-teardown\fotos-teste"
$outDir = Join-Path $root "resultados"
$csvPath = Join-Path $root "resultados.csv"

if (-not (Test-Path $keyPath)) {
    Write-Error "Nao encontrei $keyPath. Crie o arquivo com sua chave da fal.ai (uma linha, so a chave) e rode de novo."
    exit 1
}
$falKey = (Get-Content $keyPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($falKey)) {
    Write-Error "$keyPath esta vazio."
    exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function ConvertTo-DataUri($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $b64 = [Convert]::ToBase64String($bytes)
    $ext = [System.IO.Path]::GetExtension($path).TrimStart('.').ToLower()
    $mime = if ($ext -eq 'jpg') { 'jpeg' } else { $ext }
    return "data:image/$mime;base64,$b64"
}

# Preco de referencia (USD/imagem), so para o relatorio final
$precos = @{
    "fal-ai/nano-banana/edit"  = 0.039
    "fal-ai/flux-pro/kontext"  = 0.04
}

$testes = @(
    @{ nome = "01_mobiliar_nanobanana";  modelo = "fal-ai/nano-banana/edit"; foto = "A_sala_vazia_18041820.jpg";
       prompt = "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result." }
    @{ nome = "02_mobiliar_fluxkontext"; modelo = "fal-ai/flux-pro/kontext";  foto = "A_sala_vazia_18041820.jpg";
       prompt = "Furnish this empty living room in a modern style. Keep the walls, windows, doors, floor, and lighting EXACTLY as they are -- do not alter the architecture. Add only photorealistic furniture and decor at correct scale. Photorealistic result." }
    @{ nome = "03_esvaziar_nanobanana";  modelo = "fal-ai/nano-banana/edit"; foto = "B2_sala_mobiliada_6782353.jpg";
       prompt = "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same." }
    @{ nome = "04_esvaziar_fluxkontext"; modelo = "fal-ai/flux-pro/kontext";  foto = "B2_sala_mobiliada_6782353.jpg";
       prompt = "Remove all furniture, rugs, and decor from this room, leaving it completely empty. Reconstruct the floor and walls naturally where objects were removed, matching the existing flooring and wall material. Keep the architecture, windows, doors, and lighting exactly the same." }
    @{ nome = "05_trocar_piso_nanobanana"; modelo = "fal-ai/nano-banana/edit"; foto = "D_cozinha_4030908.jpg";
       prompt = "Change ONLY the flooring in this kitchen to polished concrete. Keep every other element of the image -- cabinets, walls, appliances, lighting, ceiling, camera angle -- exactly, pixel-identical to the original. Do not change anything except the floor material." }
    @{ nome = "06_trocar_ceu_nanobanana";  modelo = "fal-ai/nano-banana/edit"; foto = "E_fachada_nublada_7031595.jpg";
       prompt = "Replace the sky in this house facade photo with a dramatic warm sunset sky (orange and pink gradient). Keep the building, landscaping, and foreground exactly the same. Adjust lighting and reflections on the facade to match the new sky naturally." }
    @{ nome = "07_melhorar_nanobanana";   modelo = "fal-ai/nano-banana/edit"; foto = "F_foto_escura.jpg";
       prompt = "Fix the exposure and white balance of this underexposed, dark room photo. Brighten it naturally as if well-lit by daylight, correct the color balance, remove noise. Keep the composition, furniture, and all objects exactly the same -- only correct the lighting and color." }
)

$resultados = @()

foreach ($t in $testes) {
    $fotoPath = Join-Path $fotosDir $t.foto
    Write-Output "=== $($t.nome)  [$($t.modelo)] ==="
    if (-not (Test-Path $fotoPath)) {
        Write-Output "  FALHOU: foto nao encontrada -> $fotoPath"
        $resultados += [PSCustomObject]@{ teste=$t.nome; modelo=$t.modelo; foto=$t.foto; tempo_s=""; status="foto_nao_encontrada"; custo_usd=""; resolucao=""; arquivo="" }
        continue
    }

    $dataUri = ConvertTo-DataUri $fotoPath

    if ($t.modelo -eq "fal-ai/flux-pro/kontext") {
        $body = @{ prompt = $t.prompt; image_url = $dataUri; output_format = "jpeg" }
    } else {
        $body = @{ prompt = $t.prompt; image_urls = @($dataUri); output_format = "jpeg" }
    }
    $json = $body | ConvertTo-Json -Depth 6

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-RestMethod -Uri "https://fal.run/$($t.modelo)" -Method Post `
            -Headers @{ Authorization = "Key $falKey" } -ContentType "application/json" `
            -Body $json -TimeoutSec 180
        $sw.Stop()

        $img = $resp.images[0]
        if (-not $img) { throw "resposta sem 'images[0]' -- $($resp | ConvertTo-Json -Depth 4 -Compress)" }

        $outFile = Join-Path $outDir "$($t.nome).jpg"
        Invoke-WebRequest -Uri $img.url -OutFile $outFile -TimeoutSec 60

        $custo = $precos[$t.modelo]
        Write-Output "  OK  $([math]::Round($sw.Elapsed.TotalSeconds,1))s  $($img.width)x$($img.height)  ~US$$custo"
        $resultados += [PSCustomObject]@{
            teste=$t.nome; modelo=$t.modelo; foto=$t.foto; tempo_s=[math]::Round($sw.Elapsed.TotalSeconds,1)
            status="ok"; custo_usd=$custo; resolucao="$($img.width)x$($img.height)"; arquivo=$outFile
        }
    } catch {
        $sw.Stop()
        Write-Output "  FALHOU: $($_.Exception.Message)"
        $resultados += [PSCustomObject]@{
            teste=$t.nome; modelo=$t.modelo; foto=$t.foto; tempo_s=[math]::Round($sw.Elapsed.TotalSeconds,1)
            status="erro: $($_.Exception.Message)"; custo_usd=""; resolucao=""; arquivo=""
        }
    }
}

$resultados | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Output ""
Write-Output "=== Resumo ==="
$resultados | Format-Table teste, status, tempo_s, resolucao, custo_usd -AutoSize
$totalCusto = ($resultados | Where-Object { $_.custo_usd } | Measure-Object -Property custo_usd -Sum).Sum
Write-Output "Custo total estimado: US`$$totalCusto"
Write-Output "Resultados salvos em: $outDir"
Write-Output "Planilha: $csvPath"
