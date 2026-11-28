'use strict'
/* Synthetic people for local testing only. Never used in production. */

const PERSONAS = [
  { id: 'rachel.requester@jones.test', name: 'Rachel Requester', title: 'Site Project Manager', emoji: '🧑‍🔧', color: '#6366f1', roles: ['VOB_Requester'] },
  { id: 'ronan.requester@jones.test', name: 'Ronan Requester', title: 'Buyer', emoji: '🧑‍💼', color: '#8b5cf6', roles: ['VOB_Requester'] },
  { id: 'paddy.purchasing@jones.test', name: 'Paddy Purchasing', title: 'Purchasing Manager', emoji: '🛒', color: '#0ea5e9', roles: ['VOB_Requester', 'VOB_PurchasingManager'] },
  { id: 'priya.procurement@jones.test', name: 'Priya Procurement', title: 'Procurement Approver', emoji: '📑', color: '#14b8a6', roles: ['VOB_ProcurementApprover'] },
  { id: 'ben.bank@jones.test', name: 'Ben Bankcheck', title: 'Bank Verifier (AP)', emoji: '📞', color: '#f59e0b', roles: ['VOB_BankVerifier'] },
  { id: 'fiona.finance@jones.test', name: 'Fiona Finance', title: 'Financial Controller', emoji: '💶', color: '#10b981', roles: ['VOB_FinancialController'] },
  { id: 'adam.admin@jones.test', name: 'Adam Admin', title: 'Master Data Admin', emoji: '🛠️', color: '#ef4444', roles: ['VOB_MasterDataAdmin'] },
  { id: 'aoife.auditor@jones.test', name: 'Aoife Auditor', title: 'Internal Audit (read-only)', emoji: '🔍', color: '#64748b', roles: ['VOB_Auditor'] },
]

const find = id => PERSONAS.find(p => p.id === id || p.id.split('@')[0] === id || p.id.split('.')[0] === id)

module.exports = { PERSONAS, find }
