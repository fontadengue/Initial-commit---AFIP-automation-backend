import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, Download } from 'lucide-react';

export default function App() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [currentClient, setCurrentClient] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.xlsx') && !uploadedFile.name.endsWith('.xls')) {
      alert('Por favor, carga un archivo Excel (.xlsx o .xls)');
      return;
    }

    setFile(uploadedFile);
  };

  const processExcel = async () => {
    if (!file) return;

    setProcessing(true);
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Conectar con tu backend
      const response = await fetch('https://initial-commit-afip-automation-backend.onrender.com/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error en el servidor');

      // Stream de progreso (si implementas SSE)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'progress') {
              setCurrentClient(data.cuit);
              setProgress({ current: data.current, total: data.total });
            } else if (data.type === 'complete') {
              setResults(data.results);
              setProcessing(false);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al procesar: ' + error.message);
      setProcessing(false);
    }
  };

  const downloadResults = () => {
    if (!results) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultados_afip_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Automatización AFIP/ARCA
            </h1>
          </div>

          <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">Formato del Excel:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Columna A:</strong> CUIT (sin guiones, ej: 20345678901)</li>
              <li>• <strong>Columna B:</strong> Clave AFIP/ARCA</li>
              <li>• Primera fila puede contener encabezados (se ignora)</li>
            </ul>
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
              'Iniciar Proceso'
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
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-3 mb-3">
                <div
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-indigo-800">
                CUIT actual: <span className="font-mono font-semibold">{currentClient}</span>
              </p>
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
                  onClick={downloadResults}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Descargar Resultados
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-200 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">CUIT</th>
                      <th className="p-2 text-left">Estado</th>
                      <th className="p-2 text-left">Datos Extraídos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="p-2 font-mono">{result.cuit}</td>
                        <td className="p-2">
                          {result.success ? (
                            <span className="flex items-center gap-1 text-green-700">
                              <CheckCircle className="w-4 h-4" />
                              Éxito
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-700">
                              <XCircle className="w-4 h-4" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          {result.success ? (
                            <pre className="bg-white p-2 rounded border">
                              {JSON.stringify(result.data, null, 2)}
                            </pre>
                          ) : (
                            <span className="text-red-600">{result.error}</span>
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
        </div>
      </div>
    </div>
  );
}
