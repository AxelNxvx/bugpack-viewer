import { useEffect, useRef, useState } from "react";
import shellHtml from "./legacy/viewer-shell.html?raw";
import { initLegacyViewer } from "./legacy/viewer-app";
import { ReportList } from "./ReportList";

export function App() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = viewerRef.current;
    if (!host) return;

    host.innerHTML = shellHtml;

    const timer = setTimeout(() => {
      try {
        initLegacyViewer();
        setReady(true);
      } catch (e) {
        console.error("Error inicializando el visor:", e);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0c0d10' }}>
      
      {/* Barra superior (React) */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #262a35', zIndex: 10 }}>
        <ReportList />
      </div>

      {/* Contenedor del visor legacy */}
      <div 
        ref={viewerRef} 
        className="bugpack-viewer-host" 
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }} 
      />
      
      {/* EL CSS MÁGICO PARA QUE LOS BOTONES QUEPAN EN LA PANTALLA */}
      <style>{`
        /* Ocultar la barra superior duplicada de tu HTML original */
        .bugpack-viewer-host .nav {
          display: none !important;
        }
        
        /* Forzar al visor a medir el 100% de su contenedor, no de la ventana */
        .bugpack-viewer-host #viewer {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
        
        .bugpack-viewer-host .panels {
          flex: 1 !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
        
        .bugpack-viewer-host .video-panel,
        .bugpack-viewer-host .player-shell {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        
        .bugpack-viewer-host .video-wrap {
          flex: 1 !important;
          min-height: 0 !important;
          height: 0 !important; /* Obliga al video a encogerse para dejar ver los controles */
        }

        /* Aseguramos que la barra de controles inferiores siempre esté visible */
        .bugpack-viewer-host .player-bar {
          flex-shrink: 0 !important;
        }
      `}</style>
    </div>
  );
}