import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPage from './pages/AdminPage';
import NavGraphEditor from './pages/NavGraphEditor';
import './styles/global.css';
import './styles/admin.css';

function getHash() {
  return window.location.hash.replace('#', '') || 'admin';
}

function Root() {
  const [page, setPage] = useState(getHash);
  const [editorTarget, setEditorTarget] = useState(null); // { type, id, label }
  const [runtimeNavGraph, setRuntimeNavGraph] = useState(null);
  const [initialNavigation, setInitialNavigation] = useState(null);

  useEffect(() => {
    const handler = () => setPage(getHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (hash) => { window.location.hash = hash; };

  const openEditor = (id, label, type = 'floor') => {
    setEditorTarget({ type, id, label });
    navigate('graph-editor');
  };

  const handleEditorSaveGraph = (graph) => {
    const startNode = graph?.nodes?.find(node => node.type === 'start') ?? graph?.nodes?.[0] ?? null;
    const seq = Date.now();
    setRuntimeNavGraph(graph);
    setInitialNavigation(startNode ? { startNodeId: startNode.id, seq } : null);
    navigate('viewer');
  };

  if (page === 'admin') {
    return <AdminPage onExit={() => navigate('viewer')} onOpenEditor={openEditor} />;
  }
  if (page === 'graph-editor') {
    return (
      <NavGraphEditor
        targetType={editorTarget?.type || 'floor'}
        targetId={editorTarget?.id}
        floorId={editorTarget?.type === 'space' ? null : editorTarget?.id}
        floorLabel={editorTarget?.label}
        onExit={() => navigate('admin')}
        onSaveGraph={handleEditorSaveGraph}
      />
    );
  }
  return (
    <App
      onEnterAdmin={() => navigate('admin')}
      navGraph={runtimeNavGraph}
      initialNavigation={initialNavigation}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Root />
);
