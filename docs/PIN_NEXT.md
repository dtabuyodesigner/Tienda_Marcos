# PIN local pendiente

Siguiente mejora propuesta: desbloqueo rapido con PIN local de 4 a 6 cifras cuando ya exista una sesion Supabase valida.

Condiciones:

- El PIN no sustituye a Supabase Auth.
- Si la sesion Supabase ha expirado o no existe, la app debe pedir login normal.
- No se debe guardar el PIN en texto plano.
- El PIN debe validarse solo como comodidad local para una sesion ya autorizada por Auth y RLS.
- Cualquier implementacion debe mantener logout real y limpieza de sesion Supabase.
