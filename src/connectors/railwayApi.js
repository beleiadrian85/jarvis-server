// CONNECTOR RAILWAY API — serverul isi poate seta SINGUR variabilele de mediu
// (ex. dupa Google OAuth) si redeclansa deploy-ul, folosind RAILWAY_API_TOKEN
// deja prezent in mediu. Folosit DOAR de wizard-ul de conectare (aditiv).

const GQL = "https://backboard.railway.app/graphql/v2";

function ids() {
  return {
    projectId: process.env.RAILWAY_PROJECT_ID,
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    serviceId: process.env.RAILWAY_SERVICE_ID,
    token: process.env.RAILWAY_API_TOKEN,
  };
}
export function railwayApiAvailable() {
  const i = ids();
  return !!(i.projectId && i.environmentId && i.serviceId && i.token);
}

async function gql(query, variables) {
  const i = ids();
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${i.token}` },
    body: JSON.stringify({ query, variables }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.errors) throw new Error(`Railway API: ${d.errors?.[0]?.message || res.status}`);
  return d.data;
}

/** Seteaza variabile pe serviciul curent (upsert). Valorile NU se logheaza. */
export async function upsertVariables(vars = {}) {
  if (!railwayApiAvailable()) return { ok: false, error: "RAILWAY_API_TOKEN/ids lipsa" };
  const i = ids();
  for (const [name, value] of Object.entries(vars)) {
    await gql(
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { projectId: i.projectId, environmentId: i.environmentId, serviceId: i.serviceId, name, value } }
    );
  }
  console.log(`[railway-api] ${Object.keys(vars).length} variabile setate (valori nelogate)`);
  return { ok: true, set: Object.keys(vars) };
}

/** Redeclanseaza deploy-ul serviciului (aplica variabilele noi). */
export async function redeployService() {
  if (!railwayApiAvailable()) return { ok: false, error: "RAILWAY_API_TOKEN/ids lipsa" };
  const i = ids();
  await gql(
    `mutation($environmentId: String!, $serviceId: String!) { serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId) }`,
    { environmentId: i.environmentId, serviceId: i.serviceId }
  );
  return { ok: true };
}
