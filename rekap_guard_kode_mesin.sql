-- =====================================================================
-- JALANKAN DI SUPABASE PROJECT REKAP ABSEN (bukan project pdp).
-- Kunci 'kode_mesin' di absen_config hanya boleh ditulis oleh sinkronisasi
-- dari pdp (memakai service_role). Kunci publik yang tertanam di halaman
-- rekap (anon) tidak bisa menimpa atau menghapusnya. Aman dijalankan ulang.
-- =====================================================================
create or replace function public.absen_config_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op in ('UPDATE', 'DELETE') and old.key = 'kode_mesin' then
      raise exception 'Kunci kode_mesin hanya boleh diubah lewat sinkronisasi dari pdp.';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.key = 'kode_mesin' then
      raise exception 'Kunci kode_mesin hanya boleh diubah lewat sinkronisasi dari pdp.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_absen_config_guard on public.absen_config;
create trigger trg_absen_config_guard
  before insert or update or delete on public.absen_config
  for each row execute function public.absen_config_guard();
