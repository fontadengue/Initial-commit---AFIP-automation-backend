import React, { useState } from 'react';

function App() {
  const [file, setFile] = useState(null);

  const handleUpload = async () => {
    if (!file) {
      alert("Seleccioná un archivo Excel");
      return;
    }

    const formData = new FormData();
    formData.append('excel', file);

    const response = await fetch("https://initial-commit-afip-automation-backend.onrender.com/api/process", {
      method: "POST",
      body: formData
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      console.log(decoder.decode(value));
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Frontend AFIP</h1>

      <input
        type="file"
        accept=".xls,.xlsx"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={handleUpload}>
        Procesar Excel
      </button>
    </div>
  );
}

export default App;
