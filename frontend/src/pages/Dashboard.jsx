import ReactFlow, { MiniMap, Controls, Background } from "reactflow";

import "reactflow/dist/style.css";
import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Scale,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  FileText,
  Bot,
  Send,
  User,
  Users,
  AlertCircle,
  Briefcase,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "../contexts/LanguageContext";
import { ensureSessionId } from "../utils/session";

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { documentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const file = location.state?.file;

  const [analysis, setAnalysis] = useState(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [classification, setClassification] = useState(null);
  const [chatHistory, setChatHistory] = useState([
    {
      role: "assistant",
      message:
        "I have analyzed your document. How can I help you understand it better?",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    // Initial fetch for analysis
    const fetchAnalysis = async () => {
      try {
        const formData = new FormData();
        if (file) formData.append("file", file);

        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const sessionId = await ensureSessionId(apiUrl);
        const response = await fetch(
          `${apiUrl}/api/analyze/${documentId}?language=${language}`,
          {
            method: "POST",
            headers: { "X-Session-Id": sessionId },
            body: formData,
          },
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Analysis request failed");
        }
        const data = await response.json();
        setAnalysis(data.analysis);
        setClassification(data.classification);
        setKnowledgeGraph(data.knowledge_graph);
      } catch (err) {
        console.error(err);
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        let msg =
          err.message !== "Failed to fetch" &&
          err.message !== "Analysis request failed"
            ? err.message
            : "Analysis failed. Please try uploading the document again.";

        if (
          apiUrl.includes("localhost") &&
          window.location.hostname !== "localhost"
        ) {
          msg =
            "Configuration Error: API URL is set to localhost in production. Please set VITE_API_URL in Vercel.";
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [documentId, file, language]);

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: "user", message: chatInput };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const sessionId = await ensureSessionId(apiUrl);
      const response = await fetch(`${apiUrl}/api/chat/${documentId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId,
        },
        body: JSON.stringify({
          user_message: userMsg.message,
          chat_history: chatHistory,
          language: language,
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      // Set up a stream reader to consume the plaintext chunks
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantMsg = "";

      // Add a placeholder assistant message that will be progressively populated
      setChatHistory([...newHistory, { role: "assistant", message: "" }]);
      setChatLoading(false); // Turn off loading state once streaming begins

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkValue = decoder.decode(value);
          assistantMsg += chunkValue;

          setChatHistory((prev) => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = {
                role: "assistant",
                message: assistantMsg,
              };
            }
            return updated;
          });
        }
      }
    } catch (err) {
      console.error(err);
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      let msg =
        "This is a fallback response. The backend might not be running correctly.";

      if (
        apiUrl.includes("localhost") &&
        window.location.hostname !== "localhost"
      ) {
        msg =
          "Configuration Error: API URL is still set to localhost. Fix this in Vercel Environment Variables.";
      }

      setChatHistory([...newHistory, { role: "assistant", message: msg }]);
      setChatLoading(false);
    } finally {
      setChatLoading(false);
    }
  };
  const filteredNodes =
    knowledgeGraph?.nodes?.filter((node) => {
      const matchesSearch = node.label
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      const matchesType =
        selectedType === "all" ? true : node.type === selectedType;

      return matchesSearch && matchesType;
    }) || [];

  const graphNodes = filteredNodes.map((node, index) => ({
    id: node.id,

    data: {
      label: node.label,
      type: node.type,
    },

    position: {
      x: (index % 4) * 250,
      y: Math.floor(index / 4) * 150,
    },

    style: {
      padding: 10,
      borderRadius: 12,
      border: "1px solid #cbd5e1",
      background:
        node.type === "clauses"
          ? "#dbeafe"
          : node.type === "obligations"
            ? "#fef3c7"
            : node.type === "parties"
              ? "#dcfce7"
              : node.type === "dates"
                ? "#fee2e2"
                : "#ffffff",

      width: 180,
      fontSize: 12,
    },
  }));

  const visibleNodeIds = new Set(graphNodes.map((node) => node.id));

  const graphEdges =
    knowledgeGraph?.edges
      ?.filter((edge) => {
        return (
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
        );
      })
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: true,
      })) || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="w-16 h-16 mb-6 border-4 rounded-full border-nyaya-200 border-t-nyaya-500 animate-spin"></div>
        <h2 className="text-2xl font-bold text-slate-800">
          Analyzing Document via Advanced AI...
        </h2>
        <p className="mt-2 text-slate-500">
          Extracting clauses and cross-referencing Indian Law
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-slate-50">
        <AlertTriangle className="w-16 h-16 mb-4 text-red-500" />
        <h2 className="text-2xl font-bold text-slate-800">
          Something went wrong
        </h2>
        <p className="mt-2 mb-6 text-slate-500">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 text-white bg-slate-900 rounded-xl"
        >
          Go Back
        </button>
      </div>
    );
  }

  const getRiskColor = (risk) => {
    if (risk === "High") return "text-red-600 bg-red-50 border-red-200";
    if (risk === "Medium") return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-green-600 bg-green-50 border-green-200";
  };

  return (
    <div className="relative min-h-screen pb-12 bg-slate-50">
      <nav className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between h-16 px-6 mx-auto max-w-7xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 transition-colors rounded-full hover:bg-slate-100 text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-800">
              <Scale className="w-6 h-6 text-nyaya-500" /> NyayaVanni
            </div>
          </div>
          <div className="px-3 py-1 text-sm font-medium rounded-full text-slate-500 bg-slate-100">
            Doc ID: {documentId.substring(0, 8)}...
          </div>
        </div>
      </nav>

      <main className="grid grid-cols-1 gap-8 px-6 mx-auto mt-8 max-w-7xl lg:grid-cols-12">
        {/* Left Column: Analysis Results */}
        <div className="space-y-6 lg:col-span-7">
          <div className="p-8 transition-all transform bg-white border shadow-sm rounded-2xl border-slate-200 hover:shadow-md">
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="block mb-1 text-sm font-bold tracking-wider uppercase text-nyaya-600">
                  {t("dashboard.doctype")}
                </span>
                <h1 className="text-3xl font-bold text-slate-900">
                  {analysis?.document_type || "Unknown Document"}
                </h1>
                {classification && (
                  <div className="p-3 mt-3 border border-blue-200 rounded-xl bg-blue-50">
                    <div className="text-sm font-bold text-blue-700">
                      Detected Type: {classification.predicted_type}
                    </div>

                    <div className="mt-1 text-xs text-slate-600">
                      Confidence: {(classification.confidence * 100).toFixed(1)}
                      %
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      Alternatives:
                      <ul className="mt-1 ml-5 list-disc">
                        {classification.alternatives?.map((alt, i) => (
                          <li key={i}>
                            {alt.type} → {(alt.score * 100).toFixed(0)}%
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <div
                className={`px-4 py-2 rounded-xl flex items-center gap-2 border font-bold ${getRiskColor(analysis?.risk_level)}`}
              >
                <AlertTriangle className="w-5 h-5" />
                {analysis?.risk_level} {t("dashboard.risk")}
              </div>
            </div>

            <p className="mb-6 text-lg leading-relaxed text-slate-700">
              {analysis?.summary}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="flex items-start gap-3 p-4 border bg-slate-50 rounded-xl border-slate-100">
                <Calendar className="w-5 h-5 text-nyaya-500 mt-0.5" />
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                    {t("dashboard.status")}
                  </div>
                  <div className="font-medium text-slate-900">
                    {analysis?.urgency}
                  </div>
                  {analysis?.deadline && (
                    <div className="mt-1 text-sm font-semibold text-red-600">
                      {analysis.deadline}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border bg-slate-50 rounded-xl border-slate-100">
                <FileText className="w-5 h-5 text-nyaya-500 mt-0.5" />
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">
                    {t("dashboard.sections")}
                  </div>
                  <div className="font-medium leading-tight text-slate-900">
                    {analysis?.sections?.join(", ") || "None identified"}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2">
              {analysis?.parties && analysis.parties.length > 0 && (
                <div className="p-4 border bg-slate-50 rounded-xl border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-nyaya-500" />
                    <h4 className="font-bold text-slate-900">
                      {t("dashboard.parties")}
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {analysis.parties.map((party, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-medium text-slate-800">
                          {party.name}
                        </span>
                        <span className="text-slate-500 bg-white px-2 py-0.5 rounded border text-xs">
                          {party.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.consequences && analysis.consequences.length > 0 && (
                <div className="p-4 border bg-slate-50 rounded-xl border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-nyaya-500" />
                    <h4 className="font-bold text-slate-900">
                      {t("dashboard.consequences")}
                    </h4>
                  </div>
                  <ul className="pl-4 space-y-2 text-sm list-disc text-slate-700">
                    {analysis.consequences.map((cons, idx) => (
                      <li key={idx}>{cons}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <h3 className="mb-4 text-lg font-bold text-slate-900">
              {t("dashboard.actions")}
            </h3>
            <div className="space-y-3">
              {analysis?.actions?.map((action, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 p-4 border rounded-xl border-nyaya-100 bg-nyaya-50/50"
                >
                  <div className="flex items-center justify-center w-8 h-8 text-sm font-bold rounded-full bg-nyaya-100 text-nyaya-600 shrink-0">
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">
                      {action.action}
                    </h4>
                    <p className="mt-1 text-sm text-slate-600">
                      {action.timeline} • {action.why}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4 mt-8 sm:flex-row">
              <button
                onClick={() => {
                  setChatInput(
                    "Please provide a detailed, paragraph-by-paragraph analysis of this document.",
                  );
                  document
                    .querySelector("form")
                    .dispatchEvent(
                      new Event("submit", { cancelable: true, bubbles: true }),
                    );
                }}
                className="flex items-center justify-center flex-1 gap-2 px-4 py-3 font-bold transition-colors bg-white border-2 border-nyaya-500 text-nyaya-600 hover:bg-nyaya-50 rounded-xl"
              >
                <Search className="w-5 h-5" /> {t("dashboard.btn.detailed")}
              </button>
            </div>

            {(analysis?.risk_level === "High" ||
              analysis?.risk_level === "Medium") && (
              <div className="p-6 mt-8 border bg-amber-50 rounded-xl border-amber-200">
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600 shrink-0">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-bold text-slate-900">
                      {t("dashboard.consult.title")}
                    </h4>
                    <p className="mb-4 whitespace-pre-wrap text-slate-700">
                      Due to the {analysis?.risk_level?.toLowerCase()} risk
                      nature of this {analysis?.document_type}, we strongly
                      suggest consulting with a specialized lawyer to protect
                      your interests.
                    </p>
                    <button
                      onClick={() => navigate("/lawyers")}
                      className="inline-block px-6 py-2 font-semibold text-white transition-colors bg-slate-900 hover:bg-nyaya-600 rounded-xl"
                    >
                      {t("dashboard.consult.btn")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {knowledgeGraph && (
          <div className="p-6 bg-white border shadow-sm rounded-2xl border-slate-200">
            <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Legal Knowledge Graph
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Interactive visualization of clauses, obligations, parties,
                  and relationships
                </p>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 text-sm border outline-none border-slate-300 rounded-xl focus:ring-2 focus:ring-nyaya-200"
                />

                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2 text-sm border outline-none border-slate-300 rounded-xl focus:ring-2 focus:ring-nyaya-200"
                >
                  <option value="all">All Types</option>
                  <option value="parties">Parties</option>
                  <option value="clauses">Clauses</option>
                  <option value="obligations">Obligations</option>
                  <option value="dates">Dates</option>
                  <option value="legal_terms">Legal Terms</option>
                  <option value="financial_terms">Financial Terms</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden border h-150 rounded-xl border-slate-200">
              <ReactFlow
                nodes={graphNodes}
                edges={graphEdges}
                fitView
                onNodeClick={(event, node) => {
                  setSelectedNode(node);
                }}
              >
                <MiniMap />
                <Controls />
                <Background />
              </ReactFlow>
            </div>

            {selectedNode && (
              <div className="p-4 mt-5 border bg-slate-50 border-slate-200 rounded-xl">
                <h3 className="mb-3 text-lg font-bold text-slate-900">
                  Node Details
                </h3>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-slate-700">Label:</span>{" "}
                    {selectedNode.data.label}
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700">Type:</span>{" "}
                    {selectedNode.data.type}
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700">
                      Node ID:
                    </span>{" "}
                    {selectedNode.id}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-5 text-sm md:grid-cols-4">
              <div className="p-3 border rounded-lg bg-slate-50">
                <div className="font-semibold text-slate-900">Nodes</div>
                <div className="text-slate-600">
                  {knowledgeGraph.nodes?.length || 0}
                </div>
              </div>

              <div className="p-3 border rounded-lg bg-slate-50">
                <div className="font-semibold text-slate-900">
                  Relationships
                </div>
                <div className="text-slate-600">
                  {knowledgeGraph.edges?.length || 0}
                </div>
              </div>

              <div className="p-3 border rounded-lg bg-slate-50">
                <div className="font-semibold text-slate-900">Clauses</div>
                <div className="text-slate-600">
                  {knowledgeGraph.nodes?.filter((n) => n.type === "clauses")
                    .length || 0}
                </div>
              </div>

              <div className="p-3 border rounded-lg bg-slate-50">
                <div className="font-semibold text-slate-900">Obligations</div>
                <div className="text-slate-600">
                  {knowledgeGraph.nodes?.filter((n) => n.type === "obligations")
                    .length || 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: AI Chat */}
        <div className="lg:col-span-5 h-[calc(100vh-8rem)] sticky top-24 flex flex-col bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 p-4 text-white bg-slate-900">
            <Bot className="w-6 h-6 text-nyaya-400" />
            <h3 className="text-lg font-semibold">Nyaya Assistant</h3>
          </div>

          <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-slate-50/50">
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-nyaya-500 text-white" : "bg-slate-200 text-slate-600"}`}
                >
                  {msg.role === "user" ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>
                <div
                  className={`p-4 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap ${msg.role === "user" ? "bg-nyaya-900 text-white rounded-tr-sm shadow-md" : "bg-white border rounded-tl-sm text-slate-700 shadow-sm"}`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-li:my-0.5 prose-ul:my-1 prose-p:my-1 prose-strong:text-slate-900">
                      <ReactMarkdown>{msg.message}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.message
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1 p-4 bg-white border rounded-tl-sm shadow-sm rounded-2xl text-slate-700">
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"></div>
                  <div
                    className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleChat}
            className="flex gap-2 p-4 bg-white border-t"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              className="flex-1 px-5 py-3 text-sm transition-all border-transparent rounded-full outline-none bg-slate-100 focus:bg-white focus:border-nyaya-500 focus:ring-2 focus:ring-nyaya-200"
              disabled={chatLoading}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="flex items-center justify-center w-12 h-12 text-white transition-colors rounded-full shadow-md bg-nyaya-600 hover:bg-nyaya-700 disabled:opacity-50"
            >
              <Send className="w-5 h-5 pl-0.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
