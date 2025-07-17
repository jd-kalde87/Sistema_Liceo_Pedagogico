const app = Vue.createApp({
    data() {
        return {
            apiUrl: 'https://script.google.com/macros/s/AKfycbx-SV6z5A63Dg6Ksd54L3DUdJylwfDTu8uNYdmCrzzbWqbCKRaV2gDpvHa99tWbzLJNRw/exec',
            logoBase64: 'logo.png',
            vistaActual: 'estudiantes', isLoading: true, isSaving: false,
            // Datos
            estudiantes: [], pagos: [],
            // Módulos
            modalVisible: false, mostrarTabla: false, filtroNivel: '', filtroJornada: '', esNuevoEstudiante: true, formEstudiante: {},
            contextoPago: null, pagoForm: {},
            reporteGenerado: '', filtroAnio: new Date().getFullYear(), filtroNivelCartera: '', reporteCartera: { deudoresMatricula: [], estadoPensiones: [] }, reporteFinanciero: { totalMatricula: 0, ingresosPorMes: [] },
            estadisticasGeneradas: false, estadisticas: {}, graficoNiveles: null,
            estudianteCertificadoId: '',
            alertaModal: { visible: false, titulo: '', mensaje: '', tipo: 'info' },
            filtroNivelPagos: '', listaEstudiantesPagos: [], historialModal: { visible: false, estudiante: {}, pagos: [] },
            filtroFechaInicioRecaudos: '', filtroFechaFinRecaudos: '', reporteRecaudos: [],
            filtroNivelDetalle: '', reporteDetallado: [], detalleModal: { visible: false, estudianteNombre: '', concepto: '', pagos: [] },
            reporteLoncheras: [],
        }
    },
    computed: {
        estudiantesActivos() { return this.estudiantes.filter(e => e.Estado === 'ACTIVO' || e.Estado === 'EXENTO'); },
        nivelesUnicos() { return [...new Set(this.estudiantes.map(e => e.Nivel))].sort(); },
        aniosDisponibles() { const anios = new Set(this.pagos.filter(p => p.Fecha_Pago).map(p => new Date(p.Fecha_Pago).getFullYear())); if (!anios.has(new Date().getFullYear())) { anios.add(new Date().getFullYear()); } return [...anios].sort((a, b) => b - a); },
        meses() { return ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]; },
        estudianteCertificado() { return this.estudiantes.find(e => e.ID_Estudiante === this.estudianteCertificadoId) || {}; },
        diaActual() { return new Date().getDate(); },
        anioActual() { return new Date().getFullYear(); },
        mesActualLetras() { return new Date().toLocaleString('es-CO', { month: 'long' }); },
        filteredStudents() { let f = this.estudiantes; if (this.filtroNivel) { f = f.filter(e => e.Nivel === this.filtroNivel); } if (this.filtroJornada) { f = f.filter(e => e.Jornada === this.filtroJornada); } return f; },
        totalIngresos() {
            if (!this.reporteFinanciero.ingresosPorMes) return { Pension: 0, Lonchera: 0, Total: 0 };
            return this.reporteFinanciero.ingresosPorMes.reduce((acc, mes) => { acc.Pension += mes.Pension; acc.Lonchera += mes.Lonchera; acc.Total += mes.Total; return acc; }, { Pension: 0, Lonchera: 0, Total: 0 });
        },
        totalGeneralRecaudado() { return this.reporteRecaudos.reduce((acc, item) => acc + item.total, 0); }
    },
    methods: {
        async fetchInitialData() {
            this.isLoading = true;
            try {
                const response = await fetch(this.apiUrl + '?action=getInitialData');
                if (!response.ok) throw new Error('Respuesta de red no fue exitosa.');
                const data = await response.json();
                this.estudiantes = data.estudiantes || [];
                this.pagos = data.pagos || [];
            } catch (error) { this.mostrarAlerta('Error Crítico', `No se pudieron cargar los datos. Detalle: ${error.message}`, 'error'); } 
            finally { this.isLoading = false; }
        },
        generarReporteFinanciero() {
            let totalMatriculaAnual = 0;
            this.pagos.filter(p => p.Concepto === 'Matrícula' && p.Fecha_Pago && new Date(p.Fecha_Pago).getFullYear() === this.filtroAnio)
                      .forEach(pago => { totalMatriculaAnual += Number(pago.Valor_Pagado) || 0; });
            
            const ingresosPorMes = this.meses.map(mes => ({ mes, Pension: 0, Lonchera: 0, Total: 0 }));
            
            this.pagos.filter(p => (p.Concepto === 'Pensión' || p.Concepto === 'Lonchera'))
                .forEach(pago => {
                    const mesIndex = this.meses.indexOf(pago.Mes_Pension);
                    if (mesIndex !== -1) {
                        const valor = Number(pago.Valor_Pagado) || 0;
                        if (pago.Concepto === 'Pensión') {
                            ingresosPorMes[mesIndex].Pension += valor;
                        } else if (pago.Concepto === 'Lonchera') {
                            ingresosPorMes[mesIndex].Lonchera += valor;
                        }
                        ingresosPorMes[mesIndex].Total += valor;
                    }
                });

            this.reporteFinanciero = { totalMatricula: totalMatriculaAnual, ingresosPorMes: ingresosPorMes };
            this.reporteGenerado = 'financiero';
            this.mostrarAlerta('Éxito', 'Informe Financiero generado.', 'exito');
        },
        generarReporteDetallado() {
            let estudiantesFiltrados = this.estudiantesActivos;
            if (this.filtroNivelDetalle) {
                estudiantesFiltrados = this.estudiantesActivos.filter(e => e.Nivel === this.filtroNivelDetalle);
            }
            this.reporteDetallado = estudiantesFiltrados.map(est => {
                const pagosDelEstudiante = this.pagos.filter(p => p.ID_Estudiante === est.ID_Estudiante);
                const totalMatricula = pagosDelEstudiante.filter(p => p.Concepto === 'Matrícula').reduce((s, p) => s + Number(p.Valor_Pagado), 0);
                const totalPension = pagosDelEstudiante.filter(p => p.Concepto === 'Pensión').reduce((s, p) => s + Number(p.Valor_Pagado), 0);
                const totalLonchera = pagosDelEstudiante.filter(p => p.Concepto === 'Lonchera').reduce((s, p) => s + Number(p.Valor_Pagado), 0);
                return { id: est.ID_Estudiante, nombre: `${est.Primer_Nombre} ${est.Segundo_Nombre} ${est.Primer_Apellido} ${est.Segundo_Apellido}`, tomaLonchera: est.Toma_Lonchera, totalMatricula, totalPension, totalLonchera };
            });
            this.mostrarAlerta('Éxito', 'Informe Detallado generado.', 'exito');
        },
        generarReporteLoncheras() {
            const estudiantesConLonchera = this.estudiantesActivos.filter(e => e.Toma_Lonchera === 'SI');
            const pagosLonchera = this.pagos.filter(p => p.Concepto === 'Lonchera');
            this.reporteLoncheras = estudiantesConLonchera.map(est => {
                const pagosDelEstudiante = {};
                this.meses.forEach(mes => {
                    pagosDelEstudiante[mes] = pagosLonchera.some(p => p.ID_Estudiante === est.ID_Estudiante && p.Mes_Pension === mes);
                });
                return {
                    id: est.ID_Estudiante,
                    nombre: `${est.Primer_Nombre} ${est.Segundo_Nombre} ${est.Primer_Apellido} ${est.Segundo_Apellido}`,
                    pagos: pagosDelEstudiante
                };
            });
            this.reporteGenerado = 'loncheras'; 
            this.mostrarAlerta('Éxito', 'Informe de Estado de Loncheras generado.', 'exito');
        },
        mostrarDetallesPago(estudiante, concepto) {
            this.detalleModal.estudianteNombre = estudiante.nombre;
            this.detalleModal.concepto = concepto;
            this.detalleModal.pagos = this.pagos.filter(p => p.ID_Estudiante === estudiante.id && p.Concepto === concepto).sort((a, b) => new Date(b.Fecha_Pago) - new Date(a.Fecha_Pago));
            this.detalleModal.visible = true;
        },
        generarReporteCartera() {
            const estudiantesParaDeuda = this.estudiantesActivos.filter(e => e.Estado !== 'EXENTO');
            const estudiantesFiltrados = this.filtroNivelCartera ? estudiantesParaDeuda.filter(e => e.Nivel === this.filtroNivelCartera) : estudiantesParaDeuda;
            const pagosDelAnio = this.pagos.filter(p => p.Fecha_Pago && new Date(p.Fecha_Pago).getFullYear() === this.filtroAnio);
            const pagaronMatricula = new Set(pagosDelAnio.filter(p => p.Concepto === 'Matrícula').map(p => p.ID_Estudiante));
            this.reporteCartera.deudoresMatricula = estudiantesFiltrados.filter(e => !pagaronMatricula.has(e.ID_Estudiante));
            const pagosPensionDelAnio = this.pagos.filter(p => p.Concepto === 'Pensión');
            this.reporteCartera.estadoPensiones = estudiantesFiltrados.map(est => {
                const pagosDelEstudiante = {};
                this.meses.forEach(mes => { pagosDelEstudiante[mes] = pagosPensionDelAnio.some(p => p.ID_Estudiante === est.ID_Estudiante && p.Mes_Pension === mes); });
                return { id: est.ID_Estudiante, nombre: `${est.Primer_Nombre} ${est.Segundo_Nombre} ${est.Primer_Apellido} ${est.Segundo_Apellido}`, pagos: pagosDelEstudiante };
            });
            this.reporteGenerado = 'cartera';
            this.mostrarAlerta('Éxito', 'Informe de Cartera generado.', 'exito');
        },
        generarReporteRecaudos() {
            if (!this.filtroFechaInicioRecaudos || !this.filtroFechaFinRecaudos) { this.mostrarAlerta('Datos Incompletos', 'Seleccione una fecha de inicio y fin.', 'error'); return; }
            const fechaInicio = new Date(this.filtroFechaInicioRecaudos); const fechaFin = new Date(this.filtroFechaFinRecaudos);
            const pagosFiltrados = this.pagos.filter(p => { if (!p.Fecha_Pago) return false; const fechaPago = new Date(p.Fecha_Pago); return fechaPago >= fechaInicio && fechaPago <= fechaFin; });
            const recaudos = pagosFiltrados.reduce((acc, pago) => {
                const metodo = pago.Metodo_Pago || 'Otro';
                const valor = Number(pago.Valor_Pagado) || 0;
                if (!acc[metodo]) { acc[metodo] = 0; }
                acc[metodo] += valor;
                return acc;
            }, {});
            this.reporteRecaudos = Object.entries(recaudos).map(([metodo, total]) => ({ metodo, total }));
            this.reporteGenerado = 'recaudos';
        },
        generarEstadisticas() {
            this.estadisticas.porNivel = this.estudiantes.reduce((acc, e) => { acc[e.Nivel] = (acc[e.Nivel] || 0) + 1; return acc; }, {});
            this.estadisticas.porJornada = this.estudiantes.reduce((acc, e) => { acc[e.Jornada] = (acc[e.Jornada] || 0) + 1; return acc; }, {});
            this.estadisticas.porEstado = this.estudiantes.reduce((acc, e) => { if (!acc[e.Estado]) acc[e.Estado] = []; acc[e.Estado].push(e); return acc; }, {});
            const rangosEdad = { "2-3": 0, "3-4": 0, "4-5": 0, "5-6": 0, "6+": 0 };
            this.estudiantesActivos.forEach(e => { const edad = this.calcularEdad(e.Fecha_Nacimiento); if (edad >= 2 && edad < 3) rangosEdad["2-3"]++; else if (edad >= 3 && edad < 4) rangosEdad["3-4"]++; else if (edad >= 4 && edad < 5) rangosEdad["4-5"]++; else if (edad >= 5 && edad < 6) rangosEdad["5-6"]++; else if (edad >= 6) rangosEdad["6+"]++; });
            this.estadisticas.porEdad = rangosEdad;
            this.estadisticasGeneradas = true;
            this.$nextTick(() => { this.renderizarGraficoNiveles(); });
        },
        renderizarGraficoNiveles() {
            const ctx = document.getElementById('graficoNiveles')?.getContext('2d'); if (!ctx) return; if (this.graficoNiveles) this.graficoNiveles.destroy(); const data = this.estadisticas.porNivel;
            this.graficoNiveles = new Chart(ctx, { type: 'pie', data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#004aad', '#ff3131', '#f39c12', '#2ecc71', '#9b59b6', '#34495e', '#1abc9c'], }] }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
        },
        generarListaPagos() { this.listaEstudiantesPagos = this.estudiantes.filter(e => !this.filtroNivelPagos || e.Nivel === this.filtroNivelPagos); },
        mostrarHistorial(estudiante) { this.historialModal.estudiante = estudiante; this.historialModal.pagos = this.pagos.filter(p => p.ID_Estudiante === estudiante.ID_Estudiante).sort((a, b) => new Date(b.Fecha_Pago) - new Date(a.Fecha_Pago)); this.historialModal.visible = true; },
        descargarHistorial() {
            const historial = this.historialModal.pagos; if (historial.length === 0) return; let csvContent = "data:text/csv;charset=utf-8,Fecha Pago,Concepto,Mes,Numero Comprobante,Valor Pagado,Observaciones\n";
            historial.forEach(p => { const fila = [ this.formatearFecha(p.Fecha_Pago), p.Concepto, p.Mes_Pension || 'N/A', p.Numero_comprobante || '', p.Valor_Pagado, `"${p.Observaciones || ''}"` ].join(","); csvContent += fila + "\n"; });
            const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", `historial_${this.historialModal.estudiante.ID_Estudiante}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
        },
        imprimirCertificado() { if (this.estudianteCertificadoId) { window.print(); } },
        mostrarAlerta(titulo, mensaje, tipo = 'info') { this.alertaModal = { titulo, mensaje, tipo, visible: true }; },
        calcularEdad(fechaNac) { if (!fechaNac) return 0; const hoy = new Date(); const cumple = new Date(fechaNac); let edad = hoy.getFullYear() - cumple.getFullYear(); const m = hoy.getMonth() - cumple.getMonth(); if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) { edad--; } return edad; },
        formatearFechaLarga(fecha) { if (!fecha) return ''; const d = new Date(fecha); return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); },
        consultarEstudiantes() { this.mostrarTabla = true; },
        abrirModalNuevo() { this.esNuevoEstudiante = true; this.formEstudiante = { Estado: 'ACTIVO', Nivel: 'PARVULOS', Jornada: 'MAÑANA', Valor_Matricula: 0, Valor_Pension: 0, Toma_Lonchera: 'NO' }; this.modalVisible = true; },
        abrirModalEditar(estudiante) { this.esNuevoEstudiante = false; this.formEstudiante = JSON.parse(JSON.stringify(estudiante)); this.formEstudiante.Fecha_Nacimiento = this.formatearFechaParaInput(this.formEstudiante.Fecha_Nacimiento); this.formEstudiante.Fecha_matricula = this.formatearFechaParaInput(this.formEstudiante.Fecha_matricula); this.formEstudiante.Fecha_retiro = this.formatearFechaParaInput(this.formEstudiante.Fecha_retiro); this.modalVisible = true; },
        async guardarEstudiante() { if (!this.formEstudiante.Primer_Nombre || !this.formEstudiante.Primer_Apellido) { this.mostrarAlerta('Datos Incompletos', 'El nombre y el apellido son obligatorios.', 'error'); return; } this.isSaving = true; try { const response = await fetch(this.apiUrl + '?action=saveStudent', { method: 'POST', body: JSON.stringify(this.formEstudiante) }); const result = await response.json(); if (result.status === 'ok') { this.modalVisible = false; await this.fetchInitialData(); this.mostrarAlerta('Éxito', result.message, 'exito'); } else { throw new Error(result.message); } } catch (error) { this.mostrarAlerta('Error al Guardar', `No se pudo guardar: ${error.message}`, 'error'); } finally { this.isSaving = false; } },
        async eliminarEstudiante(id) { if (!confirm(`¿Estás seguro de que quieres eliminar al estudiante con ID ${id}?`)) { return; } this.isLoading = true; try { const response = await fetch(this.apiUrl + '?action=deleteStudent', { method: 'POST', body: JSON.stringify({ id: id }) }); const result = await response.json(); if (result.status === 'ok') { await this.fetchInitialData(); this.mostrarAlerta('Éxito', result.message, 'exito'); } else { throw new Error(result.message); } } catch (error) { this.mostrarAlerta('Error al Eliminar', `No se pudo eliminar: ${error.message}`, 'error'); } finally { this.isLoading = false; } },
        iniciarRegistroPago(contexto) { this.contextoPago = contexto; this.pagoForm = { ID_Estudiante: "", Concepto: contexto, Valor_Pagado: 0, Metodo_Pago: 'EFECTIVO', Fecha_Pago: new Date().toISOString().split('T')[0], Numero_comprobante: "" }; if (contexto === 'Pensión' || contexto === 'Lonchera') { const mesActual = new Date().toLocaleString('es-CO', { month: 'long' }); this.pagoForm.Mes_Pension = mesActual.charAt(0).toUpperCase() + mesActual.slice(1); } },
        actualizarMontoPago() { if (!this.pagoForm.ID_Estudiante) { this.pagoForm.Valor_Pagado = 0; return; } const estudiante = this.estudiantes.find(e => e.ID_Estudiante === this.pagoForm.ID_Estudiante); if (!estudiante) return; if (this.contextoPago === 'Matrícula') { this.pagoForm.Valor_Pagado = estudiante.Valor_Matricula; } else if (this.contextoPago === 'Pensión') { this.pagoForm.Valor_Pagado = estudiante.Valor_Pension; } else { this.pagoForm.Valor_Pagado = 0; } },
        async registrarPago() { if (!this.pagoForm.ID_Estudiante || this.pagoForm.Valor_Pagado <= 0) { this.mostrarAlerta('Datos Incompletos', 'Seleccione un estudiante e ingrese un valor mayor a cero.', 'error'); return; } this.isSaving = true; try { const response = await fetch(this.apiUrl + '?action=recordPayment', { method: 'POST', body: JSON.stringify(this.pagoForm) }); const result = await response.json(); if (result.status === 'ok') { await this.fetchInitialData(); this.contextoPago = null; this.mostrarAlerta('Éxito', result.message, 'exito'); } else { throw new Error(result.message); } } catch (error) { this.mostrarAlerta('Error al Registrar', `No se pudo registrar el pago: ${error.message}`, 'error'); } finally { this.isSaving = false; } },
        formatearFechaParaInput(fecha) { if (!fecha) return ''; const d = new Date(fecha); if (isNaN(d.getTime())) return ''; return d.toISOString().split('T')[0]; },
        formatearFecha(fecha) { if (!fecha) return 'N/A'; const d = new Date(fecha); if (isNaN(d.getTime())) return 'Fecha inválida'; const opciones = { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }; return d.toLocaleDateString('es-CO', opciones); }
    },
    mounted() {
        this.fetchInitialData();
    }
});
app.mount('#app');
