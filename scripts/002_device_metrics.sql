-- Расширение capabilities: сохранение metrics и dashboard из MQTT
create or replace function public.merge_device_commands(
  p_device_id text,
  p_commands jsonb,
  p_metrics jsonb default null,
  p_dashboard jsonb default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.devices (device_id, name, metadata)
  values (
    p_device_id,
    p_device_id,
    jsonb_strip_nulls(jsonb_build_object(
      'commands', p_commands,
      'metrics', p_metrics,
      'dashboard', p_dashboard
    ))
  )
  on conflict (device_id) do update
    set metadata = coalesce(public.devices.metadata, '{}'::jsonb)
                   || jsonb_strip_nulls(jsonb_build_object(
                        'commands', p_commands,
                        'metrics', p_metrics,
                        'dashboard', p_dashboard
                      ));
end;
$$;
