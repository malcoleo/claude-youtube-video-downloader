// client/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CreateShortPage from './pages/CreateShort';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<CreateShortPage />} />
          <Route path="/create-short" element={<CreateShortPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;