import { useAuth } from "react-oidc-context";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Groups from "./pages/Groups";
import React from "react";

function App() {
  const auth = useAuth();
  
  const getConfig = () => ({
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
    cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN,
    logoutUri: import.meta.env.VITE_APP_BASE_URL,
  });

  const signOutRedirect = () => {
    const { clientId, cognitoDomain, logoutUri } = getConfig();
    const redirectUri = `${logoutUri}/`;
    
    auth.removeUser();
    
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(redirectUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  const PrivateRoute = ({ children }) => {
    if (!auth.isAuthenticated) {
      return <Navigate to="/" />;
    }
    return children;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            {auth.isAuthenticated ? (
              <Navigate to="/dashboard" />
            ) : (
              <div>
                <h1>Welcome to MoneySplit</h1>
                <p>Split expenses easily with friends and family</p>
                <button 
                  onClick={() => auth.signinRedirect()}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    margin: '20px'
                  }}
                >
                  Sign in with Cognito
                </button>
              </div>
            )}
          </div>
        } />
        
        <Route path="/dashboard" element={
          <PrivateRoute>
            <AuthenticatedLayout auth={auth} signOutRedirect={signOutRedirect}>
              <Dashboard />
            </AuthenticatedLayout>
          </PrivateRoute>
        } />
        
        <Route path="/groups/:groupId" element={
          <PrivateRoute>
            <AuthenticatedLayout auth={auth} signOutRedirect={signOutRedirect}>
              <Groups />
            </AuthenticatedLayout>
          </PrivateRoute>
        } />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

function AuthenticatedLayout({ children, auth, signOutRedirect }) {
  return (
    <div>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem',
        backgroundColor: '#f0f0f0',
        borderBottom: '1px solid #ccc'
      }}>
        <h2 style={{ margin: 0 }}>MoneySplit</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>Welcome, {auth.user?.profile?.email || auth.user?.profile?.name || 'User'}</span>
          <button 
            onClick={signOutRedirect}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main style={{ padding: '1rem' }}>
        {children}
      </main>
    </div>
  );
}

export default App;