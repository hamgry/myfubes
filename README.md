# Fube

Feed personalizado de canales de YouTube. App web + extensión Chrome.

## App web

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Pega una URL de canal, un `@handle` o un ID `UCxxxx`.

El feed usa el RSS oficial de YouTube. No pide API key.

## Extensión

1. Arranca la app web.
2. Abre `chrome://extensions`.
3. Activa modo desarrollador.
4. Carga `extension/` como unpacked.
5. Recarga la extensión. Pulsa el icono de Fube.
