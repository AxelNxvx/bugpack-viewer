import { useCallback, useEffect, useRef, useState } from "react";
import {
  listRemoteReports,
  downloadRemoteReport,
  openReportInViewer,
  retryNasUpload,
  type RemoteReportSummary
} from "./api/reports";
import "./styles/reports.css";

const POLL_MS = 5000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

export function ReportList() {
  const [data, setData] = useState<RemoteReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const known = useRef<Set<string> | null>(null);

  const open = useCallback(async (r: RemoteReportSummary) => {
    try {
      const blob = await downloadRemoteReport(r.id);
      await openReportInViewer(blob, r.filename || `${r.title}.bugpack`);
      setActiveId(r.id);
      setFresh(prev => {
        if (!prev.has(r.id)) return prev;
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
      window.history.pushState({}, '', `?id=${r.id}`);
    } catch (e) {
      console.error(e);
      alert("No se pudo abrir el reporte. ¿Está encendido el servidor?");
    }
  }, []);

  // Leer el Deep Link al cargar
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');
    if (reportId && data.length > 0) {
      const found = data.find(r => r.id === reportId);
      if (found && activeId !== found.id) {
        void open(found);
      }
    }
  }, [data, open, activeId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.hidden && known.current) return;
      try {
        const list = await listRemoteReports();
        if (cancelled) return;
        setData(list);
        setError(false);

        const firstLoad = known.current === null;
        const seen = known.current ?? new Set<string>();
        const arrived = list.filter(r => !seen.has(r.id));
        known.current = new Set(list.map(r => r.id));

        if (arrived.length && !firstLoad) {
          setFresh(prev => new Set([...prev, ...arrived.map(r => r.id)]));
        }
      } catch (err) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open]);

  // --- LÓGICA DE FILTRADO COMBINADO ---
  const rows = data.filter(r => {
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      const matchTitle = (r.title ?? "").toLowerCase().includes(needle);
      const matchUrl = (r.url ?? "").toLowerCase().includes(needle);
      if (!matchTitle && !matchUrl) return false;
    }
    if (filterSeverity !== "all" && r.severity !== filterSeverity) {
      return false;
    }
    if (filterDate) {
      const reportDate = new Date(r.createdAt).toISOString().split('T')[0];
      if (reportDate !== filterDate) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setSearchTerm("");
    setFilterSeverity("all");
    setFilterDate("");
  };

  const copyDeepLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="rp-container">
      {/* BARRA DE FILTROS COMPACTA */}
      <div className="rp-bar">
        <input
          className="rp-search"
          placeholder="Buscar..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        
        <select className="rp-select" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="all">Todas</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>

        <input 
          type="date" 
          className="rp-select" 
          value={filterDate} 
          onChange={e => setFilterDate(e.target.value)} 
        />

        {(searchTerm || filterSeverity !== "all" || filterDate) && (
          <button className="rp-clear-btn" onClick={clearFilters}>×</button>
        )}
      </div>

      {/* LISTA DE CHIPS */}
      <div className="rp-list">
        {isLoading && <span className="rp-msg">Cargando...</span>}
        {error && <span className="rp-msg rp-msg-err">Sin conexión</span>}
        {!isLoading && !error && rows.length === 0 && <span className="rp-msg">Sin resultados</span>}

        {rows.map(r => (
          <div
            key={r.id}
            className={`rp-chip${activeId === r.id ? " active" : ""}`}
            onClick={() => open(r)}
            title={`${r.filename ?? r.title}\n${r.url ?? ""}\nNAS: ${r.nas?.status ?? 'N/A'}`}
          >
            <span 
              style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                backgroundColor: r.severity === 'high' ? '#ff6b6b' : (r.severity === 'medium' ? '#ffd166' : '#1db96a'),
              }} 
            />
            <div className="rp-text">
              <span className="rp-title">{r.title}</span>
              <span className="rp-meta">{formatDate(r.createdAt)} · {r.severity ? r.severity.toUpperCase() : "LOW"}{typeof r.score === "number" ? ` · ${r.score}/100` : ""}</span>
            </div>
            <button style={{color:'#fff'}} className="rp-action-btn" onClick={(e) => copyDeepLink(e, r.id)}>
              {copiedId === r.id ? "✅" : "Liga Compartible"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
