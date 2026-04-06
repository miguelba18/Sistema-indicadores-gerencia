/**
 * periodo.js — Script compartido para el selector de año/mes en cada área.
 * Requiere: #selAnio, #selMes, #periodoLabel, y opcionalmente #periodoTag
 */
(function () {
  const MESES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  function actualizar() {
    const anio = document.getElementById('selAnio').value;
    const mes  = document.getElementById('selMes').value;
    const texto = `${MESES[mes]} ${anio}`;
    const lbl = document.getElementById('periodoLabel');
    const tag = document.getElementById('periodoTag');
    if (lbl) lbl.textContent = texto;
    if (tag) tag.textContent = texto;
    // Disparar evento global para que la página pueda reaccionar
    document.dispatchEvent(new CustomEvent('periodoChange', {
      detail: { anio: parseInt(anio), mes: parseInt(mes), texto }
    }));
  }

  document.getElementById('selAnio').addEventListener('change', actualizar);
  document.getElementById('selMes').addEventListener('change', actualizar);

  // Sincronizar con fecha actual al cargar
  const hoy = new Date();
  const selAnio = document.getElementById('selAnio');
  const selMes  = document.getElementById('selMes');
  const anioActual = String(hoy.getFullYear());
  const mesActual  = String(hoy.getMonth() + 1);
  if ([...selAnio.options].some(o => o.value === anioActual)) selAnio.value = anioActual;
  if ([...selMes.options].some(o => o.value === mesActual))   selMes.value  = mesActual;
  actualizar();
})();
