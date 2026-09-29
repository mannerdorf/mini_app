-- Source: https://docs.google.com/spreadsheets/d/1sCtHHvIE-WyWZtwl9Dltf_cXL0bcv5wDrLp-CHL17-0/edit?gid=960394981#gid=960394981
-- Effective 2026-09-29. Progressive distance rates, pickup and last mile.
-- Deploy the calculator supporting distance_rates before applying this migration.
BEGIN;
DO $migration$
DECLARE
  base_payload jsonb := $payload${
  "note": "За МКАД — по участкам до 10, 20, 30, 40 км и свыше 40 км. За КАД — единая ставка за каждый км.",
  "source_url": "https://docs.google.com/spreadsheets/d/1sCtHHvIE-WyWZtwl9Dltf_cXL0bcv5wDrLp-CHL17-0/edit?gid=960394981#gid=960394981",
  "cities": {
    "moscow": {
      "ring_label": "МКАД",
      "tiers": [
        {
          "weight_max_kg": 100.0,
          "volume_max_m3": 0.5,
          "city_fee": 1350.0,
          "per_km": 23.0,
          "load_minutes": 30.0,
          "overtime_rub_per_hour": 700.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 23.0
            },
            {
              "max_km": 20,
              "per_km": 29.0
            },
            {
              "max_km": 30,
              "per_km": 38.0
            },
            {
              "max_km": 40,
              "per_km": 50.0
            },
            {
              "max_km": null,
              "per_km": 75.0
            }
          ]
        },
        {
          "weight_max_kg": 500.0,
          "volume_max_m3": 2.0,
          "city_fee": 2300.0,
          "per_km": 24.0,
          "load_minutes": 30.0,
          "overtime_rub_per_hour": 700.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 24.0
            },
            {
              "max_km": 20,
              "per_km": 31.0
            },
            {
              "max_km": 30,
              "per_km": 40.0
            },
            {
              "max_km": 40,
              "per_km": 52.0
            },
            {
              "max_km": null,
              "per_km": 78.0
            }
          ]
        },
        {
          "weight_max_kg": 1000.0,
          "volume_max_m3": 4.0,
          "city_fee": 3200.0,
          "per_km": 25.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 25.0
            },
            {
              "max_km": 20,
              "per_km": 32.0
            },
            {
              "max_km": 30,
              "per_km": 41.0
            },
            {
              "max_km": 40,
              "per_km": 53.0
            },
            {
              "max_km": null,
              "per_km": 80.0
            }
          ]
        },
        {
          "weight_max_kg": 1250.0,
          "volume_max_m3": 6.0,
          "city_fee": 3800.0,
          "per_km": 27.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 27.0
            },
            {
              "max_km": 20,
              "per_km": 35.0
            },
            {
              "max_km": 30,
              "per_km": 45.0
            },
            {
              "max_km": 40,
              "per_km": 59.0
            },
            {
              "max_km": null,
              "per_km": 89.0
            }
          ]
        },
        {
          "weight_max_kg": 1500.0,
          "volume_max_m3": 8.0,
          "city_fee": 3900.0,
          "per_km": 27.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 27.0
            },
            {
              "max_km": 20,
              "per_km": 35.0
            },
            {
              "max_km": 30,
              "per_km": 45.0
            },
            {
              "max_km": 40,
              "per_km": 59.0
            },
            {
              "max_km": null,
              "per_km": 89.0
            }
          ]
        },
        {
          "weight_max_kg": 2000.0,
          "volume_max_m3": 12.0,
          "city_fee": 5600.0,
          "per_km": 27.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 27.0
            },
            {
              "max_km": 20,
              "per_km": 35.0
            },
            {
              "max_km": 30,
              "per_km": 45.0
            },
            {
              "max_km": 40,
              "per_km": 59.0
            },
            {
              "max_km": null,
              "per_km": 89.0
            }
          ]
        },
        {
          "weight_max_kg": 2500.0,
          "volume_max_m3": 14.0,
          "city_fee": 7000.0,
          "per_km": 33.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 33.0
            },
            {
              "max_km": 20,
              "per_km": 43.0
            },
            {
              "max_km": 30,
              "per_km": 56.0
            },
            {
              "max_km": 40,
              "per_km": 73.0
            },
            {
              "max_km": null,
              "per_km": 110.0
            }
          ]
        },
        {
          "weight_max_kg": 3000.0,
          "volume_max_m3": 16.0,
          "city_fee": 7500.0,
          "per_km": 33.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 33.0
            },
            {
              "max_km": 20,
              "per_km": 43.0
            },
            {
              "max_km": 30,
              "per_km": 56.0
            },
            {
              "max_km": 40,
              "per_km": 73.0
            },
            {
              "max_km": null,
              "per_km": 110.0
            }
          ]
        },
        {
          "weight_max_kg": 5000.0,
          "volume_max_m3": 30.0,
          "city_fee": 8900.0,
          "per_km": 44.0,
          "load_minutes": 90.0,
          "overtime_rub_per_hour": 1500.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 44.0
            },
            {
              "max_km": 20,
              "per_km": 57.0
            },
            {
              "max_km": 30,
              "per_km": 74.0
            },
            {
              "max_km": 40,
              "per_km": 96.0
            },
            {
              "max_km": null,
              "per_km": 144.0
            }
          ]
        },
        {
          "weight_max_kg": 7000.0,
          "volume_max_m3": 35.0,
          "city_fee": 15000.0,
          "per_km": 53.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 1800.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 53.0
            },
            {
              "max_km": 20,
              "per_km": 69.0
            },
            {
              "max_km": 30,
              "per_km": 89.0
            },
            {
              "max_km": 40,
              "per_km": 116.0
            },
            {
              "max_km": null,
              "per_km": 174.0
            }
          ]
        },
        {
          "weight_max_kg": 10000.0,
          "volume_max_m3": 40.0,
          "city_fee": 15500.0,
          "per_km": 53.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 2000.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 53.0
            },
            {
              "max_km": 20,
              "per_km": 69.0
            },
            {
              "max_km": 30,
              "per_km": 89.0
            },
            {
              "max_km": 40,
              "per_km": 116.0
            },
            {
              "max_km": null,
              "per_km": 174.0
            }
          ]
        },
        {
          "weight_max_kg": 20000.0,
          "volume_max_m3": 86.0,
          "city_fee": 23000.0,
          "per_km": 70.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 2200.0,
          "distance_rates": [
            {
              "max_km": 10,
              "per_km": 70.0
            },
            {
              "max_km": 20,
              "per_km": 91.0
            },
            {
              "max_km": 30,
              "per_km": 118.0
            },
            {
              "max_km": 40,
              "per_km": 153.0
            },
            {
              "max_km": null,
              "per_km": 230.0
            }
          ]
        }
      ]
    },
    "kaliningrad": {
      "ring_label": "КАД",
      "tiers": [
        {
          "weight_max_kg": 100.0,
          "volume_max_m3": 0.5,
          "city_fee": 800.0,
          "per_km": 22.0,
          "load_minutes": 30.0,
          "overtime_rub_per_hour": 700.0
        },
        {
          "weight_max_kg": 500.0,
          "volume_max_m3": 2.0,
          "city_fee": 1250.0,
          "per_km": 22.0,
          "load_minutes": 30.0,
          "overtime_rub_per_hour": 700.0
        },
        {
          "weight_max_kg": 1000.0,
          "volume_max_m3": 4.0,
          "city_fee": 1850.0,
          "per_km": 22.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0
        },
        {
          "weight_max_kg": 1250.0,
          "volume_max_m3": 6.0,
          "city_fee": 2200.0,
          "per_km": 28.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0
        },
        {
          "weight_max_kg": 1500.0,
          "volume_max_m3": 8.0,
          "city_fee": 2450.0,
          "per_km": 28.0,
          "load_minutes": 45.0,
          "overtime_rub_per_hour": 700.0
        },
        {
          "weight_max_kg": 2000.0,
          "volume_max_m3": 12.0,
          "city_fee": 3100.0,
          "per_km": 28.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0
        },
        {
          "weight_max_kg": 2500.0,
          "volume_max_m3": 14.0,
          "city_fee": 3600.0,
          "per_km": 33.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0
        },
        {
          "weight_max_kg": 3000.0,
          "volume_max_m3": 16.0,
          "city_fee": 4800.0,
          "per_km": 33.0,
          "load_minutes": 60.0,
          "overtime_rub_per_hour": 1000.0
        },
        {
          "weight_max_kg": 5000.0,
          "volume_max_m3": 30.0,
          "city_fee": 6500.0,
          "per_km": 35.0,
          "load_minutes": 90.0,
          "overtime_rub_per_hour": 1500.0
        },
        {
          "weight_max_kg": 7000.0,
          "volume_max_m3": 35.0,
          "city_fee": 7500.0,
          "per_km": 53.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 1800.0
        },
        {
          "weight_max_kg": 10000.0,
          "volume_max_m3": 40.0,
          "city_fee": 12500.0,
          "per_km": 53.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 2000.0
        },
        {
          "weight_max_kg": 20000.0,
          "volume_max_m3": 86.0,
          "city_fee": 23000.0,
          "per_km": 70.0,
          "load_minutes": 120.0,
          "overtime_rub_per_hour": 2200.0
        }
      ]
    }
  }
}$payload$::jsonb;
  entry record;
  set_id bigint;
  version_payload jsonb;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('pickup_matrix', 'Заборная логистика', 'pickup'),
    ('last_mile_matrix', 'Последняя миля', 'last_mile')
  ) AS v(code, name, scope)
  LOOP
    INSERT INTO haulz_calc_tariff_sets(code,name,block)
    VALUES(entry.code,entry.name,entry.scope) ON CONFLICT(code) DO NOTHING;
    SELECT id INTO set_id FROM haulz_calc_tariff_sets WHERE code=entry.code;
    version_payload := base_payload || jsonb_build_object('scope',entry.scope);
    INSERT INTO haulz_calc_tariff_versions(tariff_set_id,effective_from,payload,created_by,comment)
    VALUES(set_id,DATE '2026-09-29',version_payload,'migration_121','Таблица тарифов: МКАД по участкам, КАД за км')
    ON CONFLICT(tariff_set_id,effective_from) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM haulz_calc_tariff_versions
      WHERE tariff_set_id=set_id AND effective_from=DATE '2026-09-29' AND payload=version_payload) THEN
      RAISE EXCEPTION 'A different tariff version already exists for % on 2026-09-29; review it before applying migration 121',entry.code;
    END IF;
  END LOOP;
END $migration$;
COMMIT;
