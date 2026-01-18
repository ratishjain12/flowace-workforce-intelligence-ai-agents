import { useState, useEffect } from 'react';
import { isLoggedIn, getUser, logout } from './api';
import Login from './components/Login';
import Chat from './components/Chat';
import Classifications from './components/Classifications';
import './App.css';

type Tab = 'chat' | 'classifications';

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [user, setUser] = useState(getUser());
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    setUser(getUser());
  }, []);

  const handleLogin = () => {
    setLoggedIn(true);
    setUser(getUser());
  };

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
    setUser(null);
  };

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Workforce Intelligence Platform</h1>
        <div className="user-info">
          <span>{user?.name} ({user?.role})</span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat Agent
        </button>
        <button
          className={`tab ${activeTab === 'classifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('classifications')}
        >
          Classifications
        </button>
      </nav>

      <main className="main">
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'classifications' && <Classifications />}
      </main>
    </div>
  );
}

export default App;
