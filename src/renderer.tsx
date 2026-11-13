import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Container, Typography, Button, Paper, Stack } from '@mui/material';

declare global {
  interface Window {
    airsiftAPI: any;
  }
}

function App() {
  const [urls, setUrls] = useState<any[]>([]);
  const [input, setInput] = useState('');

  const loadUrls = async () => {
    const data = await window.airsiftAPI.getAllUrls();
    setUrls(data);
  };

  useEffect(() => {
    loadUrls();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await window.airsiftAPI.addUrl(input.trim());
    setInput('');
    loadUrls();
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>

      <h1 style={{ fontSize: '2.125rem', fontWeight: 'bold', marginBottom: '16px', fontFamily: 'Roboto, sans-serif' }}>
        Airsift
      </h1>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        
      <input
          type="text"
          placeholder="Coller une URL..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '16px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          }}
        />

        <Button variant="contained" type="submit">
          Ajouter
        </Button>
      </form>
      <Stack spacing={2}>
        {urls.map((item) => (
          <Paper key={item.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Typography>{item.url}</Typography>
            <Typography color="text.secondary">{item.status}</Typography>
          </Paper>
        ))}
      </Stack>
    </Container>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

