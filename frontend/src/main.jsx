import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";
import "bootstrap/dist/css/bootstrap.min.css";


// Load environment variables
const cognitoConfig = {
  region: import.meta.env.VITE_COGNITO_REGION,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN,
  appBaseUrl: import.meta.env.VITE_APP_BASE_URL,
};

// Validate required environment variables
const validateEnv = () => {
  const requiredVars = [
    'VITE_COGNITO_REGION',
    'VITE_COGNITO_USER_POOL_ID', 
    'VITE_COGNITO_CLIENT_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_APP_BASE_URL'
  ];
  
  const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file');
  }
};

validateEnv();

const cognitoAuthConfig = {
  authority: `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`,
  client_id: cognitoConfig.clientId,
  redirect_uri: `${cognitoConfig.appBaseUrl}/dashboard`,
  response_type: "code",
  scope: "email openid profile",
  loadUserInfo: true,
};

const root = ReactDOM.createRoot(document.getElementById("root"));

// Wrap the application with AuthProvider
root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

export default cognitoConfig; // Optional: export for use in other files