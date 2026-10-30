// "use client";

// import { useEffect, useRef, useState } from "react";
// import keycloak from "../lib/keycloak";

// export default function KeycloakProvider({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   const initialized = useRef(false);

//   const [authenticated, setAuthenticated] = useState(false);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     // Prevent Keycloak from being initialized more than once
//     if (initialized.current) {
//       return;
//     }

//     initialized.current = true;

//     const initializeKeycloak = async () => {
//       try {
//         const auth = await keycloak.init({
//           onLoad: "login-required",
//           pkceMethod: "S256",
//           checkLoginIframe: false,
//         });

//         console.log("Keycloak authenticated:", auth);

//         if (auth) {
//           console.log("Username:", keycloak.tokenParsed?.preferred_username);
//           console.log("Access Token:", keycloak.token);

//           setAuthenticated(true);
//         } else {
//           setAuthenticated(false);
//         }
//       } catch (error) {
//         console.error("Keycloak initialization failed:", error);
//         setAuthenticated(false);
//       } finally {
//         setLoading(false);
//       }
//     };

//     initializeKeycloak();
//   }, []);

//   if (loading) {
//     return <div>Checking authentication...</div>;
//   }

//   if (!authenticated) {
//     return <div>Authentication failed</div>;
//   }

//   return <>{children}</>;
// }

"use client";

import { useEffect, useRef, useState } from "react";
import keycloak from "../lib/keycloak";
import AppLoading from './AppLoading';

export default function KeycloakProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    keycloak
      .init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
      })
      .then(() => {
        console.log("Keycloak initialized");
        console.log("Authenticated:", keycloak.authenticated);

        setReady(true);
      })
      .catch((error) => {
        console.error("Keycloak initialization failed:", error);
      });
  }, []);

  if (!ready) {
    return <AppLoading />;
  }

  return <>{children}</>;
}
