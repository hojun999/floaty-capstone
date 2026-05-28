import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPage from './pages/AdminPage';
import NavGraphEditor from './pages/NavGraphEditor';
import './styles/global.css';
import './styles/admin.css';

function getHash() {
  return window.location.hash.replace('#', '');
}

function Root() {
  const [page, setPage] = useState(getHash);
  const [editorFloor, setEditorFloor] = useState(null); // { id, label }

  useEffect(() => {
    const handler = () => setPage(getHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (hash) => { window.location.hash = hash; };

  const openEditor = (floorId, floorLabel) => {
    setEditorFloor({ id: floorId, label: floorLabel });
    navigate('graph-editor');
  };

  if (page === 'admin') {
    return <AdminPage onExit={() => navigate('')} onOpenEditor={openEditor} />;
  }
  if (page === 'graph-editor') {
    return <NavGraphEditor floorId={editorFloor?.id} floorLabel={editorFloor?.label} onExit={() => navigate('admin')} />;
  }
  return <App onEnterAdmin={() => navigate('admin')} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Root />
);
