import type { Attestation, TrustAnomaly, TrustEdge, TrustGraph, TrustSnapshot } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function clamp(value: number, max = 100) {
  return Math.max(0, Math.min(max, Math.round(value * 100) / 100));
}

function postgresErrorDetails(error: any) {
  if (!error) return null;
  return {
    message: error.message ?? String(error),
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    constraint: error.constraint ?? null
  };
}

function logTrustGraph(step: string, payload: Record<string, unknown>, error?: unknown) {
  const serializedError = postgresErrorDetails(error) ?? (error instanceof Error ? { message: error.message, name: error.name } : error ? { message: String(error) } : null);
  console.log("[arc-identity] trust graph", {
    step,
    ...payload,
    ...(serializedError ? { error: serializedError } : {})
  });
}

function volumeScore(volume: number) {
  if (volume <= 0) return 0;
  if (volume < 10) return 5;
  if (volume < 50) return 10;
  if (volume < 250) return 15;
  return 20;
}

function scoreContribution(sourceScore?: number, targetScore?: number) {
  const scores = [sourceScore, targetScore].filter((score): score is number => Number.isFinite(score));
  if (scores.length === 0) return 0;
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return clamp((average / 100) * 20, 20);
}

function edgeFromRow(row: any, perspectiveWallet?: string): TrustEdge {
  const source = normalizeWallet(row.source_wallet);
  const target = normalizeWallet(row.target_wallet);
  const perspective = perspectiveWallet ? normalizeWallet(perspectiveWallet) : null;
  return {
    id: row.id,
    sourceWallet: source,
    targetWallet: target,
    peerWallet: perspective ? source === perspective ? target : source : undefined,
    interactionCount: Number(row.interaction_count ?? 0),
    totalVerifiedVolume: Number(row.total_verified_volume ?? 0),
    firstInteractionAt: row.first_interaction_at ?? null,
    lastInteractionAt: row.last_interaction_at ?? null,
    interactionTypes: Array.isArray(row.interaction_types) ? row.interaction_types.filter((item: unknown) => typeof item === "string") : [],
    trustWeight: Number(row.trust_weight ?? 0),
    reciprocal: Boolean(row.reciprocal),
    sharedCounterpartyCount: Number(row.shared_counterparty_count ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

type PublicIdentityPreview = {
  username: string | null;
  arcScore: number;
  credentialLevel: string;
  riskLevel: string;
};

function enrichEdge(edge: TrustEdge, profiles: Map<string, PublicIdentityPreview>): TrustEdge {
  const peer = edge.peerWallet ?? edge.targetWallet;
  const profile = profiles.get(peer);
  if (!profile?.username) return edge;
  return {
    ...edge,
    peerUsername: profile.username,
    peerArcScore: profile.arcScore,
    peerCredentialLevel: profile.credentialLevel,
    peerRiskLevel: profile.riskLevel
  };
}

async function getPublicIdentityPreviews(wallets: string[]) {
  const unique = Array.from(new Set(wallets.map(normalizeWallet))).filter(Boolean);
  if (unique.length === 0) return new Map<string, PublicIdentityPreview>();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("wallet_address,username,arc_score,credential_level,risk_level")
    .in("wallet_address", unique);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [normalizeWallet(row.wallet_address), {
    username: row.username ?? null,
    arcScore: Number(row.arc_score ?? 0),
    credentialLevel: row.credential_level ?? row.risk_level ?? "New / Unproven",
    riskLevel: row.risk_level ?? "New / Unproven"
  }]));
}

function snapshotFromRow(wallet: string, row: any | null): TrustSnapshot {
  return {
    walletAddress: wallet,
    trustedPeerCount: Number(row?.trusted_peer_count ?? 0),
    strongestConnectionWallet: row?.strongest_connection_wallet ? normalizeWallet(row.strongest_connection_wallet) : null,
    strongestConnectionWeight: Number(row?.strongest_connection_weight ?? 0),
    reciprocalCount: Number(row?.reciprocal_count ?? 0),
    networkHealth: row?.network_health ?? "isolated",
    totalTrustWeight: Number(row?.total_trust_weight ?? 0),
    propagatedTrustScore: Number(row?.propagated_trust_score ?? 0),
    trustConfidence: Number(row?.trust_confidence ?? 0),
    anomalyScore: Number(row?.anomaly_score ?? 0),
    maturityReason: row?.maturity_reason ?? null,
    topTrustedPeers: Array.isArray(row?.top_trusted_peers) ? row.top_trusted_peers.filter((item: unknown) => typeof item === "string") : [],
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null
  };
}

function anomalyFromRow(row: any): TrustAnomaly {
  return {
    id: row.id,
    walletAddress: normalizeWallet(row.wallet_address),
    anomalyType: row.anomaly_type,
    severity: row.severity ?? "low",
    details: row.details ?? {},
    anomalyScore: Number(row.anomaly_score ?? row.details?.anomalyScore ?? 0),
    anomalyReason: row.anomaly_reason ?? null,
    clusterSize: row.cluster_size == null ? null : Number(row.cluster_size),
    suspiciousWallets: Array.isArray(row.suspicious_wallets) ? row.suspicious_wallets.filter((item: unknown) => typeof item === "string").map(normalizeWallet) : [],
    createdAt: row.created_at
  };
}

function trustLevel(totalTrustWeight: number, peerCount: number) {
  if (peerCount === 0) return "Isolated";
  if (totalTrustWeight >= 150 && peerCount >= 3) return "Strong";
  if (totalTrustWeight >= 60) return "Developing";
  return "Emerging";
}

function maturity(peerCount: number, reciprocalCount: number) {
  if (peerCount === 0) return "Isolated";
  if (peerCount >= 3 && reciprocalCount >= 1) return "Mature";
  if (peerCount >= 2) return "Growing";
  return "Early";
}

function v1bMaturity(input: {
  peerCount: number;
  reciprocalCount: number;
  totalTrustWeight: number;
  trustConfidence: number;
  anomalyScore: number;
  relationshipDiversity: number;
}) {
  if (input.anomalyScore >= 60) return "suspicious_cluster";
  if (input.peerCount === 0) return "isolated";
  if (input.peerCount >= 8 && input.totalTrustWeight >= 250 && input.trustConfidence >= 70) return "highly_connected";
  if (input.peerCount >= 4 && input.totalTrustWeight >= 140 && input.reciprocalCount >= 2) return "trusted";
  if (input.peerCount >= 3 && input.totalTrustWeight >= 75 && input.relationshipDiversity >= 60) return "established";
  return "emerging";
}

function maturityReason(input: {
  maturity: string;
  peerCount: number;
  reciprocalCount: number;
  trustConfidence: number;
  anomalyScore: number;
}) {
  if (input.maturity === "suspicious_cluster") return "Trust activity shows concentrated or circular patterns that require review.";
  if (input.maturity === "isolated") return "No verified transaction-backed trust edges are available yet.";
  return `Based on ${input.peerCount} verified peers, ${input.reciprocalCount} reciprocal relationships and ${Math.round(input.trustConfidence)}% trust confidence.`;
}

function severityFromScore(score: number) {
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function calculateTrustConfidence(input: {
  peerCount: number;
  reciprocalCount: number;
  totalTrustWeight: number;
  relationshipDiversity: number;
  anomalyScore: number;
}) {
  return clamp(
    Math.min(input.peerCount, 10) * 6 +
    Math.min(input.reciprocalCount, 5) * 6 +
    Math.min(input.totalTrustWeight / 4, 40) +
    input.relationshipDiversity * 0.15 -
    input.anomalyScore * 0.35
  );
}

function detectTrustAnomalies(input: {
  wallet: string;
  edges: TrustEdge[];
  peerEdges: TrustEdge[];
  peerAges: Map<string, number>;
}) {
  const anomalies: Array<{ wallet_address: string; anomaly_type: string; severity: string; details: Record<string, unknown>; anomaly_score: number; anomaly_reason: string; cluster_size: number; suspicious_wallets: string[] }> = [];
  const peers = Array.from(new Set(input.edges.map((edge) => edge.peerWallet ?? edge.targetWallet).filter((peer) => peer !== input.wallet)));
  const reciprocalCount = input.edges.filter((edge) => edge.reciprocal).length;
  const reciprocalRatio = input.edges.length ? reciprocalCount / input.edges.length : 0;
  const now = Date.now();
  const recentEdges = input.edges.filter((edge) => edge.firstInteractionAt && now - new Date(edge.firstInteractionAt).getTime() <= 24 * 60 * 60 * 1000);
  const freshPeers = peers.filter((peer) => (input.peerAges.get(peer) ?? 9999) <= 7);
  const peerPairLinks = input.peerEdges.filter((edge) => peers.includes(edge.sourceWallet) && peers.includes(edge.targetWallet));
  const possiblePeerLinks = peers.length > 1 ? peers.length * (peers.length - 1) : 0;
  const density = possiblePeerLinks ? peerPairLinks.length / possiblePeerLinks : 0;

  if (peers.length > 1 && density >= 0.5) anomalies.push({
    wallet_address: input.wallet,
    anomaly_type: "tiny_dense_loop",
    severity: severityFromScore(70),
    details: { density, peers: peers.length },
    anomaly_score: 70,
    anomaly_reason: "Verified trust edges are concentrated in a small dense cluster.",
    cluster_size: peers.length + 1,
    suspicious_wallets: [input.wallet, ...peers]
  });
  if (peerPairLinks.some((edge) => edge.reciprocal) || reciprocalRatio >= 0.8 && reciprocalCount >= 2) anomalies.push({
    wallet_address: input.wallet,
    anomaly_type: "circular_attestations",
    severity: severityFromScore(60),
    details: { reciprocalRatio, reciprocalCount },
    anomaly_score: 60,
    anomaly_reason: "Circular reciprocal verification patterns detected.",
    cluster_size: peers.length + 1,
    suspicious_wallets: [input.wallet, ...peers]
  });
  if (recentEdges.length >= 3) anomalies.push({
    wallet_address: input.wallet,
    anomaly_type: "rapid_trust_farming",
    severity: severityFromScore(55),
    details: { recentEdges: recentEdges.length },
    anomaly_score: 55,
    anomaly_reason: "Multiple verified trust edges appeared in a short window.",
    cluster_size: peers.length + 1,
    suspicious_wallets: [input.wallet, ...peers]
  });
  if (input.edges.length >= 2 && reciprocalRatio >= 0.9 && peers.length <= 2) anomalies.push({
    wallet_address: input.wallet,
    anomaly_type: "excessive_reciprocal_only_cluster",
    severity: severityFromScore(65),
    details: { reciprocalRatio, peers: peers.length },
    anomaly_score: 65,
    anomaly_reason: "Trust graph relies heavily on reciprocal-only relationships.",
    cluster_size: peers.length + 1,
    suspicious_wallets: [input.wallet, ...peers]
  });
  if (freshPeers.length >= Math.max(2, peers.length) && peers.length > 0) anomalies.push({
    wallet_address: input.wallet,
    anomaly_type: "fresh_wallet_trust_ring",
    severity: severityFromScore(75),
    details: { freshPeers: freshPeers.length, peers: peers.length },
    anomaly_score: 75,
    anomaly_reason: "Verified trust is concentrated among fresh wallets.",
    cluster_size: peers.length + 1,
    suspicious_wallets: [input.wallet, ...freshPeers]
  });

  return anomalies;
}

function calculatePropagatedTrust(input: {
  wallet: string;
  edges: TrustEdge[];
  peerEdges: TrustEdge[];
  scores: Map<string, number>;
  ages: Map<string, number>;
  anomalyScore: number;
  relationshipDiversity: number;
}) {
  let influence = 0;
  const visited = new Set([input.wallet]);
  const directPeers = new Set<string>();

  for (const edge of input.edges) {
    const peer = edge.peerWallet ?? edge.targetWallet;
    if (!peer || peer === input.wallet || visited.has(peer)) continue;
    visited.add(peer);
    directPeers.add(peer);
    const peerScore = input.scores.get(peer) ?? 0;
    const age = input.ages.get(peer) ?? 0;
    const ageFactor = age <= 7 ? 0.35 : age <= 30 ? 0.65 : 1;
    const reciprocalFactor = edge.reciprocal ? 1.15 : 0.8;
    const consistencyFactor = Math.min(1, Math.max(0.35, edge.interactionCount / 3));
    const diversityFactor = input.relationshipDiversity <= 40 ? 0.55 : 1;
    influence += Math.max(0, peerScore - 45) / 55 * (edge.trustWeight / 100) * 8 * reciprocalFactor * consistencyFactor * diversityFactor * ageFactor;
  }

  for (const edge of input.peerEdges) {
    if (!directPeers.has(edge.sourceWallet)) continue;
    const secondHop = edge.targetWallet;
    if (!secondHop || visited.has(secondHop) || secondHop === input.wallet) continue;
    visited.add(secondHop);
    const score = input.scores.get(secondHop) ?? 0;
    influence += Math.max(0, score - 55) / 45 * (edge.trustWeight / 100) * 3;
  }

  const anomalyFactor = input.anomalyScore >= 60 ? 0.25 : input.anomalyScore >= 35 ? 0.55 : 1;
  return clamp(influence * anomalyFactor, 15);
}

function trustExplanations(snapshot: TrustSnapshot, anomalies: TrustAnomaly[]) {
  const explanations: string[] = [];
  if (snapshot.strongestConnectionWallet) explanations.push(`Strongest verified relationship with ${snapshot.strongestConnectionWallet.slice(0, 6)}...${snapshot.strongestConnectionWallet.slice(-4)}.`);
  if (snapshot.reciprocalCount > 0) explanations.push("Reciprocal verified interactions detected.");
  if (snapshot.propagatedTrustScore > 0) explanations.push(`Propagated trust contributes ${snapshot.propagatedTrustScore.toFixed(1)} capped points from verified network peers.`);
  if (snapshot.trustConfidence > 0) explanations.push(`Trust confidence is ${Math.round(snapshot.trustConfidence)}% based on verified edge quality and diversity.`);
  if (snapshot.trustedPeerCount === 0) explanations.push("Network currently isolated.");
  if (anomalies.some((item) => item.anomalyType === "low_diversity_trust")) explanations.push("Low relationship diversity detected.");
  if (anomalies.some((item) => item.anomalyType === "isolated_reputation_ring")) explanations.push("Isolated reciprocal reputation ring detected.");
  if (snapshot.maturityReason) explanations.push(snapshot.maturityReason);
  return explanations.length ? explanations : ["No trust anomalies detected."];
}

export async function getTrustGraph(walletAddress: string, limit = 25): Promise<TrustGraph> {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  const [edgesResult, snapshotResult, anomaliesResult] = await Promise.all([
    supabase
      .from("trust_edges")
      .select("*")
      .or(`source_wallet.eq.${wallet},target_wallet.eq.${wallet}`)
      .order("trust_weight", { ascending: false })
      .limit(limit),
    supabase
      .from("trust_snapshots")
      .select("*")
      .eq("wallet_address", wallet)
      .maybeSingle(),
    supabase
      .from("trust_anomalies")
      .select("*")
      .eq("wallet_address", wallet)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  if (edgesResult.error) throw edgesResult.error;
  if (snapshotResult.error) throw snapshotResult.error;
  if (anomaliesResult.error) throw anomaliesResult.error;

  const baseEdges = (edgesResult.data ?? []).map((row) => edgeFromRow(row, wallet));
  const peers = new Set(baseEdges.map((edge) => edge.peerWallet ?? edge.targetWallet));
  const peerList = Array.from(peers);
  const peerEdgesResult = peerList.length ? await supabase
    .from("trust_edges")
    .select("*")
    .or(peerList.map((peer) => `source_wallet.eq.${peer},target_wallet.eq.${peer}`).join(","))
    .limit(100) : { data: [], error: null };
  if (peerEdgesResult.error) throw peerEdgesResult.error;
  const peerEdges = (peerEdgesResult.data ?? []).map((row) => edgeFromRow(row));
  const scoreWallets = Array.from(new Set([wallet, ...peerList, ...peerEdges.flatMap((edge) => [edge.sourceWallet, edge.targetWallet])]));
  const publicProfiles = await getPublicIdentityPreviews(scoreWallets);
  const edges = baseEdges.map((edge) => enrichEdge(edge, publicProfiles));
  const totalTrustWeight = edges.reduce((sum, edge) => sum + edge.trustWeight, 0);
  const strongest = edges[0] ?? null;
  const reciprocalCount = edges.filter((edge) => edge.reciprocal).length;
  const { data: profileRows, error: profileError } = scoreWallets.length ? await supabase
    .from("profiles")
    .select("wallet_address,arc_score,global_wallet_age_days")
    .in("wallet_address", scoreWallets) : { data: [], error: null };
  if (profileError) throw profileError;
  const scores = new Map((profileRows ?? []).map((row) => [normalizeWallet(row.wallet_address), Number(row.arc_score ?? 0)]));
  const ages = new Map((profileRows ?? []).map((row) => [normalizeWallet(row.wallet_address), Number(row.global_wallet_age_days ?? 0)]));
  const relationshipDiversity = edges.length ? Math.min(100, Math.round((peers.size / Math.max(edges.length, 1)) * 100)) : 0;
  const computedAnomalies = detectTrustAnomalies({ wallet, edges, peerEdges, peerAges: ages });
  const storedAnomalies = (anomaliesResult.data ?? []).map(anomalyFromRow);
  const anomalyByType = new Map<string, TrustAnomaly>();
  for (const item of storedAnomalies) anomalyByType.set(item.anomalyType, item);
  for (const item of computedAnomalies) anomalyByType.set(item.anomaly_type, anomalyFromRow({
    id: `computed-${item.anomaly_type}`,
    wallet_address: item.wallet_address,
    anomaly_type: item.anomaly_type,
    severity: item.severity,
    details: item.details,
    anomaly_score: item.anomaly_score,
    anomaly_reason: item.anomaly_reason,
    cluster_size: item.cluster_size,
    suspicious_wallets: item.suspicious_wallets,
    created_at: new Date().toISOString()
  }));
  const anomalies = Array.from(anomalyByType.values());
  const anomalyScore = Math.min(100, anomalies.reduce((max, item) => Math.max(max, item.anomalyScore), 0));
  const trustConfidence = calculateTrustConfidence({ peerCount: peers.size, reciprocalCount, totalTrustWeight, relationshipDiversity, anomalyScore });
  const propagatedTrustScore = calculatePropagatedTrust({ wallet, edges, peerEdges, scores, ages, anomalyScore, relationshipDiversity });
  const maturityLabel = v1bMaturity({ peerCount: peers.size, reciprocalCount, totalTrustWeight, trustConfidence, anomalyScore, relationshipDiversity });
  const reason = maturityReason({ maturity: maturityLabel, peerCount: peers.size, reciprocalCount, trustConfidence, anomalyScore });
  const computedSnapshot = snapshotFromRow(wallet, {
    ...(snapshotResult.data ?? {}),
    trusted_peer_count: peers.size,
    strongest_connection_wallet: strongest?.peerWallet ?? strongest?.targetWallet ?? snapshotResult.data?.strongest_connection_wallet ?? null,
    strongest_connection_weight: strongest?.trustWeight ?? snapshotResult.data?.strongest_connection_weight ?? 0,
    reciprocal_count: reciprocalCount,
    network_health: maturityLabel,
    total_trust_weight: totalTrustWeight,
    propagated_trust_score: propagatedTrustScore,
    trust_confidence: trustConfidence,
    anomaly_score: anomalyScore,
    maturity_reason: reason,
    top_trusted_peers: edges.slice(0, 5).map((edge) => edge.peerWallet ?? edge.targetWallet)
  });
  const snapshot = computedSnapshot;
  const reciprocalPeers = edges.filter((edge) => edge.reciprocal);
  const strongestPeers = edges.slice(0, 5);

  return {
    walletAddress: wallet,
    edges,
    snapshot,
    anomalies,
    reciprocalPeers,
    strongestPeers,
    metrics: {
      trustedPeerCount: snapshot.trustedPeerCount,
      reciprocalCount: snapshot.reciprocalCount,
      totalTrustWeight: snapshot.totalTrustWeight,
      strongestConnectionWeight: snapshot.strongestConnectionWeight,
      networkHealth: snapshot.networkHealth,
      relationshipDiversity,
      networkMaturity: snapshot.networkHealth,
      trustLevel: trustLevel(snapshot.totalTrustWeight, snapshot.trustedPeerCount),
      propagatedTrustScore: snapshot.propagatedTrustScore,
      trustConfidence: snapshot.trustConfidence,
      anomalyScore: snapshot.anomalyScore,
      maturityReason: snapshot.maturityReason ?? reason,
      suspicious: anomalies.length > 0
    },
    explanations: trustExplanations(snapshot, anomalies)
  };
}

function calculateTrustWeight(input: {
  interactionCount: number;
  totalVerifiedVolume: number;
  reciprocal: boolean;
  sourceScore?: number;
  targetScore?: number;
}) {
  const repeatScore = Math.min(Math.max(input.interactionCount - 1, 0) * 5, 30);
  return clamp(
    10 +
    repeatScore +
    (input.reciprocal ? 10 : 0) +
    volumeScore(input.totalVerifiedVolume) +
    scoreContribution(input.sourceScore, input.targetScore)
  );
}

async function getProfileScores(wallets: string[]) {
  const supabase = getSupabaseAdmin();
  const unique = Array.from(new Set(wallets.map(normalizeWallet)));
  const { data, error } = await supabase.from("profiles").select("wallet_address,arc_score").in("wallet_address", unique);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [normalizeWallet(row.wallet_address), Number(row.arc_score ?? 0)]));
}

async function getSharedCounterpartyCount(sourceWallet: string, targetWallet: string) {
  const supabase = getSupabaseAdmin();
  const [source, target] = [normalizeWallet(sourceWallet), normalizeWallet(targetWallet)];
  const { data, error } = await supabase
    .from("trust_edges")
    .select("source_wallet,target_wallet")
    .or(`source_wallet.eq.${source},target_wallet.eq.${source},source_wallet.eq.${target},target_wallet.eq.${target}`);
  if (error) throw error;

  const sourcePeers = new Set<string>();
  const targetPeers = new Set<string>();
  for (const row of data ?? []) {
    const rowSource = normalizeWallet(row.source_wallet);
    const rowTarget = normalizeWallet(row.target_wallet);
    if (rowSource === source && rowTarget !== target) sourcePeers.add(rowTarget);
    if (rowTarget === source && rowSource !== target) sourcePeers.add(rowSource);
    if (rowSource === target && rowTarget !== source) targetPeers.add(rowTarget);
    if (rowTarget === target && rowSource !== source) targetPeers.add(rowSource);
  }
  return Array.from(sourcePeers).filter((peer) => targetPeers.has(peer)).length;
}

async function recalculateEdge(id: string) {
  const supabase = getSupabaseAdmin();
  logTrustGraph("recalculating_edge", { table: "trust_edges", edgeId: id });
  const { data: edge, error } = await supabase.from("trust_edges").select("*").eq("id", id).single();
  if (error) throw error;
  const source = normalizeWallet(edge.source_wallet);
  const target = normalizeWallet(edge.target_wallet);
  const scores = await getProfileScores([source, target]);
  const sharedCounterpartyCount = await getSharedCounterpartyCount(source, target);
  const trustWeight = calculateTrustWeight({
    interactionCount: Number(edge.interaction_count ?? 0),
    totalVerifiedVolume: Number(edge.total_verified_volume ?? 0),
    reciprocal: Boolean(edge.reciprocal),
    sourceScore: scores.get(source),
    targetScore: scores.get(target)
  });
  const { error: updateError } = await supabase.from("trust_edges").update({
    trust_weight: trustWeight,
    shared_counterparty_count: sharedCounterpartyCount,
    updated_at: new Date().toISOString()
  }).eq("id", id);
  if (updateError) {
    logTrustGraph("recalculate_edge_failed", { table: "trust_edges", edgeId: id }, updateError);
    throw updateError;
  }
}

async function updateReciprocity(sourceWallet: string, targetWallet: string) {
  const supabase = getSupabaseAdmin();
  const source = normalizeWallet(sourceWallet);
  const target = normalizeWallet(targetWallet);
  const { data: reverse, error } = await supabase
    .from("trust_edges")
    .select("id")
    .eq("source_wallet", target)
    .eq("target_wallet", source)
    .maybeSingle();
  if (error) throw error;
  if (!reverse) {
    logTrustGraph("reciprocal_edge_missing", { table: "trust_edges", sourceWallet: source, targetWallet: target });
    return;
  }

  const { data: forward, error: forwardError } = await supabase
    .from("trust_edges")
    .select("id")
    .eq("source_wallet", source)
    .eq("target_wallet", target)
    .single();
  if (forwardError) throw forwardError;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("trust_edges")
    .update({ reciprocal: true, updated_at: now })
    .in("id", [forward.id, reverse.id]);
  if (updateError) {
    logTrustGraph("reciprocal_update_failed", { table: "trust_edges", sourceWallet: source, targetWallet: target }, updateError);
    throw updateError;
  }

  await Promise.all([recalculateEdge(forward.id), recalculateEdge(reverse.id)]);
}

export async function rebuildTrustSnapshot(walletAddress: string) {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  logTrustGraph("rebuilding_snapshot", { table: "trust_snapshots", walletAddress: wallet });
  const { data: edges, error } = await supabase
    .from("trust_edges")
    .select("*")
    .or(`source_wallet.eq.${wallet},target_wallet.eq.${wallet}`);
  if (error) {
    logTrustGraph("snapshot_edges_query_failed", { table: "trust_edges", walletAddress: wallet }, error);
    throw error;
  }

  const rows = (edges ?? []).map((row) => edgeFromRow(row, wallet));
  const peers = new Set(rows.map((row) => row.peerWallet ?? row.targetWallet).filter((peer) => peer !== wallet));
  const trustedPeerCount = peers.size;
  const totalTrustWeight = rows.reduce((sum, row) => sum + Number(row.trustWeight ?? 0), 0);
  const strongest = rows.reduce<TrustEdge | null>((best, row) => !best || row.trustWeight > best.trustWeight ? row : best, null);
  const reciprocalCount = rows.filter((row) => Boolean(row.reciprocal)).length;
  const relationshipDiversity = rows.length ? Math.min(100, Math.round((peers.size / rows.length) * 100)) : 0;

  const { error: deleteAnomalyError } = await supabase.from("trust_anomalies").delete().eq("wallet_address", wallet);
  if (deleteAnomalyError) logTrustGraph("anomaly_delete_failed", { table: "trust_anomalies", walletAddress: wallet }, deleteAnomalyError);
  const anomalies: Array<{ wallet_address: string; anomaly_type: string; severity: string; details: Record<string, unknown> }> = [];
  const peerList = Array.from(peers);
  if (trustedPeerCount === 1 && reciprocalCount === 1) anomalies.push({ wallet_address: wallet, anomaly_type: "isolated_reputation_ring", severity: "medium", details: { trustedPeerCount, reciprocalCount }, anomaly_score: 45, anomaly_reason: "Isolated reciprocal reputation ring detected.", cluster_size: 2, suspicious_wallets: [wallet, ...peerList] } as any);
  if (trustedPeerCount <= 1 && totalTrustWeight > 50) anomalies.push({ wallet_address: wallet, anomaly_type: "low_diversity_trust", severity: "medium", details: { trustedPeerCount, totalTrustWeight }, anomaly_score: 50, anomaly_reason: "Low relationship diversity detected.", cluster_size: trustedPeerCount + 1, suspicious_wallets: [wallet, ...peerList] } as any);
  if (anomalies.length > 0) {
    logTrustGraph("inserting_anomaly", { table: "trust_anomalies", walletAddress: wallet, payload: anomalies });
    const { error: anomalyError } = await supabase.from("trust_anomalies").insert(anomalies);
    if (anomalyError) logTrustGraph("anomaly_insert_failed", { table: "trust_anomalies", walletAddress: wallet, payload: anomalies }, anomalyError);
  }

  const anomalyScore = Math.min(100, anomalies.reduce((max, item: any) => Math.max(max, Number(item.anomaly_score ?? 0)), 0));
  const trustConfidence = calculateTrustConfidence({ peerCount: trustedPeerCount, reciprocalCount, totalTrustWeight, relationshipDiversity, anomalyScore });
  const propagatedTrustScore = Math.min(15, rows.reduce((sum, edge) => sum + Math.max(0, edge.trustWeight / 100) * (edge.reciprocal ? 2.5 : 1.5), 0));
  const networkHealth = v1bMaturity({ peerCount: trustedPeerCount, reciprocalCount, totalTrustWeight, trustConfidence, anomalyScore, relationshipDiversity });
  const reason = maturityReason({ maturity: networkHealth, peerCount: trustedPeerCount, reciprocalCount, trustConfidence, anomalyScore });

  const payload = {
    wallet_address: wallet,
    trusted_peer_count: trustedPeerCount,
    strongest_connection_wallet: strongest?.peerWallet ?? strongest?.targetWallet ?? null,
    strongest_connection_weight: Number(strongest?.trustWeight ?? 0),
    reciprocal_count: reciprocalCount,
    network_health: networkHealth,
    total_trust_weight: clamp(totalTrustWeight, 1000000),
    propagated_trust_score: clamp(propagatedTrustScore, 15),
    trust_confidence: trustConfidence,
    anomaly_score: anomalyScore,
    maturity_reason: reason,
    top_trusted_peers: rows.slice(0, 5).map((edge) => edge.peerWallet ?? edge.targetWallet),
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: existingError } = await supabase
    .from("trust_snapshots")
    .select("id")
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (existingError) {
    logTrustGraph("snapshot_lookup_failed", { table: "trust_snapshots", walletAddress: wallet }, existingError);
    throw existingError;
  }
  if (existing) {
    const { error: updateError } = await supabase.from("trust_snapshots").update(payload).eq("id", existing.id);
    if (updateError) {
      logTrustGraph("snapshot_update_failed", { table: "trust_snapshots", walletAddress: wallet, payload }, updateError);
      throw updateError;
    }
  } else {
    const { error: insertError } = await supabase.from("trust_snapshots").insert(payload);
    if (insertError) {
      logTrustGraph("snapshot_insert_failed", { table: "trust_snapshots", walletAddress: wallet, payload }, insertError);
      throw insertError;
    }
  }
  logTrustGraph("snapshot_rebuilt", { table: "trust_snapshots", walletAddress: wallet, payload });
  return payload;
}

export async function upsertTrustEdgeFromAttestation(attestation: Attestation) {
  if (!attestation.verifiedTransaction || !attestation.txHash) return null;
  const supabase = getSupabaseAdmin();
  const source = normalizeWallet(attestation.fromWallet);
  const target = normalizeWallet(attestation.toWallet);
  if (source === target) throw new Error("Self trust edges are not allowed");

  const interactionAt = attestation.txTimestamp ?? attestation.createdAt ?? new Date().toISOString();
  const normalizedInteractionAt = Number.isNaN(new Date(interactionAt).getTime()) ? new Date().toISOString() : interactionAt;
  const type = attestation.type;
  const txValue = Number.isFinite(Number(attestation.txValue)) ? Number(attestation.txValue) : 0;
  logTrustGraph("upserting_edge_from_attestation", {
    table: "trust_edges",
    sourceWallet: source,
    targetWallet: target,
    txHash: attestation.txHash,
    interactionAt: normalizedInteractionAt,
    txValue,
    type
  });
  const { data: existing, error } = await supabase
    .from("trust_edges")
    .select("*")
    .eq("source_wallet", source)
    .eq("target_wallet", target)
    .maybeSingle();
  if (error) {
    logTrustGraph("edge_lookup_failed", { table: "trust_edges", sourceWallet: source, targetWallet: target }, error);
    throw error;
  }

  let edgeId: string;
  if (existing) {
    const interactionTypes = Array.from(new Set([...(Array.isArray(existing.interaction_types) ? existing.interaction_types : []), type]));
    const interactionCount = Number(existing.interaction_count ?? 0) + 1;
    const totalVerifiedVolume = Number(existing.total_verified_volume ?? 0) + txValue;
    const scores = await getProfileScores([source, target]);
    const reciprocal = Boolean(existing.reciprocal);
    const trustWeight = calculateTrustWeight({ interactionCount, totalVerifiedVolume, reciprocal, sourceScore: scores.get(source), targetScore: scores.get(target) });
    const { data: updated, error: updateError } = await supabase.from("trust_edges").update({
      interaction_count: interactionCount,
      total_verified_volume: totalVerifiedVolume,
      first_interaction_at: existing.first_interaction_at ?? normalizedInteractionAt,
      last_interaction_at: normalizedInteractionAt,
      interaction_types: interactionTypes,
      trust_weight: trustWeight,
      updated_at: new Date().toISOString()
    }).eq("id", existing.id).select("id").single();
    if (updateError) {
      logTrustGraph("edge_update_failed", { table: "trust_edges", sourceWallet: source, targetWallet: target }, updateError);
      throw updateError;
    }
    edgeId = updated.id;
  } else {
    const scores = await getProfileScores([source, target]);
    const trustWeight = calculateTrustWeight({ interactionCount: 1, totalVerifiedVolume: txValue, reciprocal: false, sourceScore: scores.get(source), targetScore: scores.get(target) });
    const { data: inserted, error: insertError } = await supabase.from("trust_edges").insert({
      source_wallet: source,
      target_wallet: target,
      interaction_count: 1,
      total_verified_volume: txValue,
      first_interaction_at: normalizedInteractionAt,
      last_interaction_at: normalizedInteractionAt,
      interaction_types: [type],
      trust_weight: trustWeight,
      reciprocal: false,
      shared_counterparty_count: 0
    }).select("id").single();
    if (insertError) {
      logTrustGraph("edge_insert_failed", { table: "trust_edges", sourceWallet: source, targetWallet: target }, insertError);
      if (insertError.code === "23505") {
        const { data: conflicted, error: conflictLookupError } = await supabase
          .from("trust_edges")
          .select("id")
          .eq("source_wallet", source)
          .eq("target_wallet", target)
          .single();
        if (conflictLookupError) throw conflictLookupError;
        edgeId = conflicted.id;
      } else {
        throw insertError;
      }
    } else {
      edgeId = inserted.id;
    }
  }

  await updateReciprocity(source, target);
  await recalculateEdge(edgeId);
  await Promise.all([rebuildTrustSnapshot(source), rebuildTrustSnapshot(target)]);
  logTrustGraph("edge_upsert_completed", { table: "trust_edges", sourceWallet: source, targetWallet: target, edgeId });
  return { sourceWallet: source, targetWallet: target };
}
