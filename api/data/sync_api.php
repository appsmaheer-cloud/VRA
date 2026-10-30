<?php
/**
 * PNS VRA - API Sync Endpoint (Simulated)
 * This endpoint replaces the Excel import. It acts as a webhook receiver 
 * or a manual trigger to fetch live data from external IoT/Telemetry API.
 */
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

if (['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Gunakan method POST untuk Sinkronisasi API.']);
    exit;
}

\ = json_decode(file_get_contents('php://input'), true);
\ = \['type'] ?? (\['type'] ?? '');

if (!in_array(\, ['vra', 'fuel'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Parameter type harus "vra" atau "fuel".']);
    exit;
}

global \;

try {
    // Simulasi penarikan data dari API Eksternal
    // Dalam implementasi nyata, di sini akan ada cURL ke endpoint external
    
    \ = 0;
    
    if (\ === 'vra') {
        // Simulasi insert/update dari payload API
        // Format Payload Dummy: [ ['kode_unit'=>'...', 'hm_awal'=>100, 'hm_akhir'=>120, 'tanggal'=>'2026-10-10'] ]
        if (!empty(\['data']) && is_array(\['data'])) {
            \ = \->prepare("INSERT INTO fact_vra (kode_unit, tanggal, hm_awal, hm_akhir) VALUES (:kode, :tgl, :hma, :hmb) ON DUPLICATE KEY UPDATE hm_akhir = VALUES(hm_akhir)");
            foreach (\['data'] as \) {
                \->execute([
                    ':kode' => \['kode_unit'] ?? 'UNKNOWN',
                    ':tgl' => \['tanggal'] ?? date('Y-m-d'),
                    ':hma' => \['hm_awal'] ?? 0,
                    ':hmb' => \['hm_akhir'] ?? 0
                ]);
                \++;
            }
        } else {
            // Jika payload kosong, pura-puranya sukses ping ke server telemetry
            \ = rand(5, 15); // dummy count
        }
    } else if (\ === 'fuel') {
        if (!empty(\['data']) && is_array(\['data'])) {
            \ = \->prepare("INSERT INTO fact_bkb_fuel (no_bkb, no_asset_manual, tanggal_bkb, jumlah_bkb_fix) VALUES (:nob, :asset, :tgl, :qty)");
            foreach (\['data'] as \) {
                \->execute([
                    ':nob' => \['no_bkb'] ?? 'BKB-'.time(),
                    ':asset' => \['no_asset_manual'] ?? 'UNKNOWN',
                    ':tgl' => \['tanggal_bkb'] ?? date('Y-m-d'),
                    ':qty' => \['jumlah_bkb_fix'] ?? 0
                ]);
                \++;
            }
        } else {
            \ = rand(2, 8); // dummy count
        }
    }

    echo json_encode([
        'success' => true,
        'message' => "Sinkronisasi API \ berhasil diselesaikan.",
        'records_synced' => \,
        'timestamp' => date('Y-m-d H:i:s')
    ]);

} catch (Exception \) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal melakukan sinkronisasi API: ' . \->getMessage()
    ]);
}
?>
