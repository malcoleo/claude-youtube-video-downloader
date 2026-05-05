// client/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CreateShortPage from './pages/CreateShort';
import DownloadPage from './pages/DownloadPage';
import './App.css';
import './styles/design-tokens.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<DownloadPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/create-short" element={<CreateShortPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
