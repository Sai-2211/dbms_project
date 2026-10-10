# Why CockroachDB fits this project

## Problem-driven choice

Land registration manages related records and workflows that must remain consistent: properties belong to districts and registration offices, owners hold property shares, deeds support transfers, and approvals change several records together. CockroachDB preserves a relational SQL model while providing an advanced distributed transaction architecture. It was also explicitly listed in the assignment's accepted technologies.

| Requirement                     | Database capability                   | Evidence implemented in this project                                                                                                               |
| ------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid related records           | Primary keys, foreign keys and checks | A survey, document or payment cannot refer to a nonexistent property.                                                                              |
| Complete ownership transfers    | ACID transactions                     | Closing previous holdings, inserting new shares, approving the transfer, creating the mutation and recording the audit event commit together.      |
| Concurrent transfer requests    | Serializable isolation                | A conflict triggers a retry; the backend rechecks current holdings so two requests cannot both consume the same share.                             |
| Joint ownership and inheritance | SQL tables and exact decimals         | Multiple transaction parties and fractional current/historical holdings.                                                                           |
| Search and reporting            | SQL joins and aggregations            | Dashboard totals, property distribution, history and record listings.                                                                              |
| Multiple district offices       | Distributed SQL architecture          | The schema supports district/office relationships. A future multi-node deployment can provide replication and appropriately configured resilience. |

## What makes the choice advanced

Tables and ACID transactions alone are not unique to CockroachDB. Its distinguishing feature is distributed SQL: it combines a relational interface with distributed storage, replication and transactions across a cluster. For a classroom-sized dataset this distribution is not needed for capacity; it is a defensible match to the multi-office departmental scenario.

The delivered single-node setup validates SQL constraints and serializable transaction behavior. It does **not** prove distributed availability or failover. Do not claim those were demonstrated without actually running a multi-node deployment.

## Tradeoffs

- Serialization conflicts can require application retries. `server/db.ts` retries SQLSTATE `40001` and reruns the whole business operation with fresh reads.
- PostgreSQL protocol compatibility does not mean every PostgreSQL feature is available.
- Multi-node deployments require additional configuration and suitable licensing. A local single-node developer cluster does not require a license key under the documented developer exception.
- A conventional relational database would also be sufficient for a small student application. CockroachDB is chosen to satisfy the advanced-database requirement while preserving the existing relationship-heavy design.

## Alternatives considered

- **Neo4j:** attractive if graph traversal and connected-fraud investigation dominate. The primary requirements here are record management and transactional registration workflows, so retaining the relational schema is more direct.
- **Couchbase:** supports document flexibility and transactions, but requires adapting the existing normalized schema and its integrity rules.
- **Cassandra:** a query-focused denormalized model without relational foreign keys adds complexity to ownership consistency and reporting.
- **DuckDB:** strong for analytics; less natural as this shared transactional record system's authoritative database.
- **Elasticsearch, InfluxDB, Milvus and Qdrant:** useful for specialized search/monitoring features; their strengths do not correspond to the core ownership-registration workload.

## Demonstration evidence

The isolated integration suite validates foreign keys, a complete transfer, rollback after a late failure, concurrent conflicting transfers, partial transfers, document validation and access control. These are concrete examples you can show alongside the interface.

## Official references

- [CockroachDB developer basics: transactions, retries and PostgreSQL compatibility](https://www.cockroachlabs.com/docs/stable/developer-basics.html)
- [Foreign key constraints](https://www.cockroachlabs.com/docs/stable/foreign-key)
- [Distributed architecture](https://www.cockroachlabs.com/docs/stable/architecture/overview)
- [Licensing FAQ](https://www.cockroachlabs.com/docs/stable/licensing-faqs)
- [Official Node.js CRUD example](https://www.cockroachlabs.com/docs/stable/build-a-nodejs-app-with-cockroachdb)
