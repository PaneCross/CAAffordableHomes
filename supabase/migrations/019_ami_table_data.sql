-- Migration 019: Seed AMI income limit data into site_settings
-- 2025 HUD San Diego County values (Effective April 1, 2025, Revised April 16, 2025)
-- Run once in Supabase SQL Editor.

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'ami_table_data',
  '{"year":"2025","updated":"Effective April 1, 2025 (Revised April 16, 2025)","median_income":130800,"t1_rows":[[34750,40550,46350,57900],[39700,46350,52950,66150],[44650,52150,59550,74450],[49600,57900,66150,82700],[53600,62550,71450,89350],[57550,67200,76750,95950],[61550,71800,82050,102550],[65500,76450,87350,109200]],"t2_rows":[[69480,75250,81050,92700],[79380,86000,92650,105950],[89340,96750,104200,119200],[99240,107500,115800,132400],[107220,116100,125050,143000],[115140,124700,134350,153600],[123060,133300,143600,164200],[131040,141900,152850,174800]],"t3_rows":[[82400,91550,100750,109850],[94150,104650,115100,125550],[105950,117700,129500,141250],[117700,130800,143900,156950],[127100,141250,155400,169500],[136550,151750,166900,182050],[145950,162200,178450,194600],[155350,172650,189950,207150]]}',
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'ami_updated_date',
  'Effective April 1, 2025 (Revised April 16, 2025)',
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
