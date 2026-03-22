// Database router: PostgreSQL when DATABASE_URL is set, JSON files otherwise
// Rollback: unset DATABASE_URL → instant fallback to JSON

const usePostgres = !!process.env.DATABASE_URL;

const impl = usePostgres
  ? await import('./database/pg-db.js')
  : await import('./db-json.js');

if (usePostgres) {
  console.log('📦 Database: PostgreSQL');
} else {
  console.log('📦 Database: JSON files');
}

export const {
  createTenant,
  getTenant,
  getTenantByIgPageId,
  updateTenant,
  getAllTenants,
  getConversationHistory,
  saveMessage,
  getOrCreateLead,
  getLeadIfExists,
  updateLead,
  getLeadsByTenant,
  clearConversation,
  addKnowledgeEntry,
  getKnowledgeEntries,
  getKnowledgeEntriesForTenant,
  getTenantKnowledgeEntries,
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
  createUserRecord,
  getUserByEmail,
  getAllUsers,
  getUserEmailByTenantId,
  updateUserTenant,
  updateSessionsTenant,
  saveSessionRecord,
  getSessionRecord,
  setImpersonation,
  deleteSessionRecord,
  deleteSessionsByEmail,
  cleanupExpiredSessions,
  seedTestTenant,
  searchKnowledgeByEmbedding,
  updateKnowledgeEmbedding,
  getStaleKnowledgeEntries,
  markEmbeddingStale,
  deleteTenantAndData,
  recordApiUsage,
  getUsageSummaryByTenant,
  getPlatformUsageSummary,
  getConversationCountByTenant,
  // Self-learning system (Phase 1)
  upsertOutcome,
  getOutcome,
  getActiveOutcomes,
  getOutcomeStats,
  getOutcomeStatsByTenant,
  recordQAIssue,
  getQAIssueSummary,
  getRecentQAIssues,
  // Self-learning system (Phase 2)
  saveGrade,
  getUngradedOutcomes,
  getGradeStats,
  saveGoldenExample,
  getGoldenExamples,
  updateGoldenExampleStatus,
  incrementGoldenUsage,
  searchGoldenByEmbedding,
  updateGoldenEmbedding,
  getStaleGoldenExamples,
  getPendingGoldenCount,
} = impl;
