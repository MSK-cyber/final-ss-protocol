import { useState, useEffect } from "react";
import { runDiagnostics } from "../utils/contractDiagnostics";
import "../Styles/Admin.css";

export default function DiagnosticsPage() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    try {
      const diagnosticResults = await runDiagnostics();
      setResults(diagnosticResults);
    } catch (error) {
      console.error("Diagnostic error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTest();
  }, []);

  if (loading || !results) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>🔍 Contract Diagnostics</h1>
        </div>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <div className="spinner"></div>
          <p>Running diagnostics...</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status) => {
    if (status?.includes("✅")) return "#00ff88";
    if (status?.includes("⚠️")) return "#ffaa00";
    if (status?.includes("❌")) return "#ff4444";
    return "#888";
  };

  const healthScore = parseFloat(results.summary.healthScore);
  const healthColor = healthScore >= 80 ? "#00ff88" : healthScore >= 50 ? "#ffaa00" : "#ff4444";

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>🔍 Contract Connection Diagnostics</h1>
        <button onClick={runTest} disabled={loading} className="admin-button">
          🔄 Rerun Test
        </button>
      </div>

      {/* Summary Card */}
      <div className="admin-card" style={{ marginBottom: "1.5rem" }}>
        <h2>📊 Summary</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          <div style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
            <div style={{ fontSize: "2rem", color: healthColor, fontWeight: "bold" }}>
              {results.summary.healthScore}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>Health Score</div>
          </div>
          <div style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
            <div style={{ fontSize: "2rem", color: "#00ff88", fontWeight: "bold" }}>
              {results.summary.connected}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>Connected</div>
          </div>
          <div style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
            <div style={{ fontSize: "2rem", color: "#ffaa00", fontWeight: "bold" }}>
              {results.summary.warnings}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>Warnings</div>
          </div>
          <div style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
            <div style={{ fontSize: "2rem", color: "#ff4444", fontWeight: "bold" }}>
              {results.summary.failed}
            </div>
            <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>Failed</div>
          </div>
        </div>
      </div>

      {/* RPC Connection */}
      <div className="admin-card" style={{ marginBottom: "1.5rem" }}>
        <h2>🌐 RPC Connection</h2>
        <div style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span>Status</span>
            <span style={{ color: getStatusColor(results.rpcConnection?.status) }}>
              {results.rpcConnection?.status || "Unknown"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <span>RPC URL</span>
            <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>{results.rpcUrl}</span>
          </div>
          {results.rpcConnection?.chainId && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <span>Chain ID</span>
              <span>{results.rpcConnection.chainId}</span>
            </div>
          )}
          {results.rpcConnection?.blockNumber && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
              <span>Block Number</span>
              <span>{results.rpcConnection.blockNumber.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contract Status */}
      <div className="admin-card">
        <h2>📋 Contract Status</h2>
        <div style={{ marginTop: "1rem" }}>
          {Object.entries(results.contracts).map(([name, data]) => (
            <details key={name} style={{ marginBottom: "0.5rem", background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "8px" }}>
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "bold" }}>{name}</span>
                <span style={{ color: getStatusColor(data.status) }}>{data.status}</span>
              </summary>
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Address:</strong>{" "}
                  <code style={{ fontSize: "0.875rem", background: "rgba(0,0,0,0.3)", padding: "0.25rem 0.5rem", borderRadius: "4px" }}>
                    {data.address || "None"}
                  </code>
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>Has ABI:</strong> {data.hasABI ? "✅ Yes" : "❌ No"} ({data.abiLength} functions)
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <strong>On-Chain Code:</strong> {data.onChainCode ? "✅ Deployed" : "❌ Not Found"}
                </div>
                {data.testCall && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <strong>Test Call:</strong> {data.testCall.function}() = {data.testCall.result}
                  </div>
                )}
                {data.error && (
                  <div style={{ color: "#ff4444", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                    <strong>Error:</strong> {data.error}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Cross References */}
      {results.crossReferences && (
        <div className="admin-card" style={{ marginTop: "1.5rem" }}>
          <h2>🔗 Cross-Contract References</h2>
          <div style={{ marginTop: "1rem" }}>
            {Object.entries(results.crossReferences).map(([name, data]) => (
              <div key={name} style={{ marginBottom: "1rem", padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "0.5rem", textTransform: "uppercase" }}>
                  {name} {data.match ? "✅" : "❌"}
                </div>
                <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>
                  <div>Configured: <code>{data.configured}</code></div>
                  <div>On-Chain: <code>{data.onChain}</code></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Data */}
      <details className="admin-card" style={{ marginTop: "1.5rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: "bold" }}>📄 Raw Diagnostic Data (JSON)</summary>
        <pre style={{ 
          marginTop: "1rem", 
          padding: "1rem", 
          background: "rgba(0,0,0,0.3)", 
          borderRadius: "8px", 
          overflow: "auto",
          fontSize: "0.75rem"
        }}>
          {JSON.stringify(results, null, 2)}
        </pre>
      </details>
    </div>
  );
}
