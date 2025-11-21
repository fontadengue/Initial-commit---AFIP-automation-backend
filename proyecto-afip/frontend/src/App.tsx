import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, Download } from 'lucide-react';

export default function AFIPAutomation() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [currentClient, setCurrentClient] = useState('');
  const [numCliente, setNumCliente] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [excelData, setExcelData] = useState(null);

  // ⚠️ REEMPLAZA CON TU URL DE RENDER
  const BACKEND_URL = 'https://initial-commit-afip-automation-backend.onrender.com';

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.xlsx') && !uploadedFile.name.endsWith('.xls')) {
      alert('Por favor, carga un archivo Excel (.xlsx o .xls)');
      return;
    }

    setFile(uploadedFile);
    setError(null);
    setResults(null);
    setExcelData(null);
  };

  const processExcel = async () => {
    if (!file) return;

    setProcessing(true);
    setResults(null);
    setError(null);
    setExcelData(null);

    const formData = new FormData();
    formData.append('excel', file);

    try {
      console.log('🚀 Enviando a:', `${BACKEND_URL}/api/process`);

      const response = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        body: formData,
      });

      console.log('📡 Respuesta recibida:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }

      // Leer el stream SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              console.log('📊 Evento recibido:', data.type);

              if (data.type === 'progress') {
                setCurrentClient(data.cuit);
                setNumCliente(data.numCliente || '');
                setProgress({ current: data.current, total: data.total });
              } else if (data.type === 'complete') {
                setResults(data.results);
                setExcelData({
                  base64: data.excel,
                  filename: data.filename
                });
                setProcessing(false);
                console.log('✅ Proceso completado');
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (parseError) {
              console.error('Error parseando JSON:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error:', error);
      setError(error.message);
      setProcessing(false);
      alert('Error al procesar: ' + error.message);
    }
  };

  const downloadExcel = () => {
    if (!excelData) return;

    // Convertir base64 a blob
    const byteCharacters = atob(excelData.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });

    // Crear enlace de descarga
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = excelData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const testConnection = async () => {
    try {
      console.log('🔍 Probando conexión a:', `${BACKEND_URL}/health`);
      const response = await fetch(`${BACKEND_URL}/health`);
      const data = await response.json();
      console.log('✅ Respuesta del servidor:', data);
      alert(`✅ Conexión exitosa!\nServidor: ${data.status}\nTimestamp: ${data.timestamp}`);
    } catch (error) {
      console.error('❌ Error de conexión:', error);
      alert(`❌ Error de conexión:\n${error.message}\n\nVerifica que la URL del backend sea correcta.`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Automatización AFIP - Extracción de Nombres
            </h1>
          </div>

          {/* Indicador de URL del backend */}
          <div className="mb-4 p-3 bg-gray-100 rounded border border-gray-300">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600">Backend conectado a:</span>
                <code className="ml-2 text-sm font-mono text-indigo-600">{BACKEND_URL}</code>
              </div>
              <button
                onClick={testConnection}
                className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
              >
                Probar Conexión
              </button>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded">
              <h3 className="font-semibold text-red-900 mb-2">Error</h3>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">Formato del Excel de entrada:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Columna A:</strong> CUIT (sin guiones, ej: 20345678901)</li>
              <li>• <strong>Columna B:</strong> Clave AFIP</li>
              <li>• <strong>Columna C:</strong> Número de Cliente</li>
              <li>• Primera fila: encabezados (se ignoran)</li>
            </ul>
            <div className="mt-3 p-3 bg-green-50 border border-green-300 rounded">
              <p className="text-sm font-semibold text-green-900">📊 Excel de salida:</p>
              <p className="text-sm text-green-800">
                Columna A: Número de Cliente | Columna B: Nombre del Contribuyente
              </p>
            </div>
          </div>

          {/* Upload Zone */}
          <div className="mb-6">
            <label className="block w-full">
              <div className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                file ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-indigo-500 hover:bg-indigo-50'
              }`}>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={processing}
                />
                <Upload className={`w-16 h-16 mx-auto mb-4 ${file ? 'text-green-600' : 'text-gray-400'}`} />
                {file ? (
                  <div>
                    <p className="text-lg font-semibold text-green-700">{file.name}</p>
                    <p className="text-sm text-gray-600 mt-2">Archivo cargado correctamente</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-semibold text-gray-700">
                      Haz clic para seleccionar archivo Excel
                    </p>
                    <p className="text-sm text-gray-500 mt-2">O arrastra y suelta aquí</p>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Process Button */}
          <button
            onClick={processExcel}
            disabled={!file || processing}
            className={`w-full py-4 rounded-lg font-semibold text-white text-lg transition-all ${
              !file || processing
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                Procesando...
              </span>
            ) : (
              'Iniciar Extracción de Nombres'
            )}
          </button>

          {/* Progress */}
          {processing && (
            <div className="mt-6 p-6 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-indigo-900">
                  Procesando cliente {progress.current} de {progress.total}
                </span>
                <span className="text-sm text-indigo-700">
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-3 mb-3">
                <div
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-sm text-indigo-800 space-y-1">
                <p>Cliente: <span className="font-mono font-semibold">{numCliente}</span></p>
                <p>CUIT: <span className="font-mono font-semibold">{currentClient}</span></p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  Proceso Completado
                </h2>
                <button
                  onClick={downloadExcel}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-lg"
                >
                  <Download className="w-5 h-5" />
                  Descargar Excel
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Num Cliente</th>
                      <th className="p-2 text-left">Nombre del Contribuyente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="p-2 font-mono">{result.numCliente}</td>
                        <td className="p-2">
                          {result.nombre.startsWith('ERROR:') ? (
                            <span className="text-red-600">{result.nombre}</span>
                          ) : (
                            <span className="text-gray-800">{result.nombre}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>⚠️ Esta herramienta maneja información sensible. Úsala de forma responsable.</p>
          <p className="mt-1">🔒 Las credenciales se procesan de forma segura y no se almacenan.</p>
        </div>
      </div>
    </div>
  );
