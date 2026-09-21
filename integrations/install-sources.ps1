$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path $PSScriptRoot 'sources'
New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null

$repositories = @(
  @{ Name = 'flight-finder'; Url = 'https://github.com/affromero/flight-finder.git'; Ref = '76e5a5c59d49f4040b8cf7e818ea5426ea0f43f4' },
  @{ Name = 'farecast-airfare-intelligence'; Url = 'https://github.com/YUVRAJ1178/farecast-airfare-intelligence.git'; Ref = 'c3f22122d76650abd8f8b7114d96c11459668d09' },
  @{ Name = 'gods-eye-view'; Url = 'https://github.com/bilawalsidhu/gods-eye-view.git'; Ref = '0d41b6be5490db1f10a171f238be75db4d4ec3b4' },
  @{ Name = 'airline-live-tracking-and-data-analysis'; Url = 'https://github.com/cho6957/Airline-Live-Tracking-and-Data-Analysis.git'; Ref = '9ea94c52ff716440417692c6f9998fd75694a561' },
  @{ Name = 'flights-tracker-api'; Url = 'https://github.com/AviationEdgeAPI/Flights-Tracker-API.git'; Ref = '85dbe0f5ba4f732a4f9f68330badd5c3be084e59' },
  @{ Name = 'skylight'; Url = 'https://github.com/cpaczek/skylight.git'; Ref = '1f333f94d59d01ee0ad76a46e4f12d79c0cb9f77' },
  @{ Name = 'airline-tracking-service'; Url = 'https://github.com/veeravn/airline-tracking-service.git'; Ref = '6dcda73a0d24931fdda5ec53d8f0070a09cd5f46' },
  @{ Name = 'airtrail'; Url = 'https://github.com/johanohly/AirTrail.git'; Ref = 'cecf2adff4b9cae83f278eb387b0f4460d9079b9' },
  @{ Name = 'flights'; Url = 'https://github.com/AWeirdDev/flights.git'; Ref = '64c9190bfdfb33bbe6e260ea08ff15c0ddcf74e8' },
  @{ Name = 'airfare-price-index'; Url = 'https://github.com/deepikamishra25/airfare-price-index.git'; Ref = '1295aca12fa563ad238a2d2344d7124225b61b79' }
)

foreach ($repository in $repositories) {
  $target = Join-Path $sourceRoot $repository.Name
  if (-not (Test-Path (Join-Path $target '.git'))) {
    git clone --filter=blob:none $repository.Url $target
  }
  git -C $target fetch origin $repository.Ref --depth 1
  git -C $target checkout --detach $repository.Ref
}

Write-Host "Pinned integration sources installed in $sourceRoot"
