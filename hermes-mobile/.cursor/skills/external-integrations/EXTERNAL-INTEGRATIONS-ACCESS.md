---
name: external-integrations-access
description: >
  Methods for accessing files and integrating with external tools like GitHub,
  Linear, and Obsidian. Includes techniques for API access, file operations,
  and cross-platform coordination.
---

# External Integrations and File Access

## Overview

This skill covers methods for accessing files and integrating with external tools such as GitHub, Linear, and Obsidian. These integrations enable cross-platform coordination and data synchronization between different systems.

## File Access Techniques

### 1. Direct File System Access
- Read/write operations on local files
- Directory traversal and management
- File metadata handling (permissions, timestamps)
- Binary and text file processing

### 2. Remote File Access
- SSH/SFTP for remote systems
- Cloud storage APIs (AWS S3, Google Drive, Dropbox)
- Network shares and mounted drives
- Secure file transfer protocols

### 3. Version-Controlled Access
- Git operations for repository access
- Branch management and merging
- Commit history and diff analysis
- Pull request workflows

## GitHub Integration

### API Access
- REST API for repository management
- GraphQL API for complex queries
- Authentication with tokens or SSH keys
- Rate limiting and pagination handling

### Repository Operations
- Creating, cloning, and managing repositories
- Branch and tag management
- Commit history and blame information
- Issue tracking and project boards

### Pull Request Workflow
- Creating and reviewing pull requests
- Managing merge conflicts
- Code review automation
- Status checks and CI integration

### GitHub Actions
- Workflow definition and execution
- Event triggers and scheduling
- Secrets and environment management
- Artifact storage and retrieval

## Linear Integration

### API Access
- GraphQL API for data operations
- Authentication with API tokens
- Rate limiting and error handling
- Webhook subscriptions for real-time updates

### Issue Management
- Creating, updating, and tracking issues
- Project and cycle associations
- Priority and label management
- Time tracking and estimates

### Project Tracking
- Roadmap visualization
- Cycle planning and management
- Team workload distribution
- Progress metrics and reporting

### User Management
- Team member operations
- Permission and role assignments
- Notification preferences
- Integration configurations

## Obsidian Integration

### Vault Access
- Reading and writing Markdown files
- Graph database queries
- Plugin API interactions
- Dataview queries for structured data

### Note Management
- Creating and organizing notes
- Tagging and linking systems
- Template processing
- Daily note automation

### Plugin Ecosystem
- Canvas board operations
- Advanced tables and databases
- Custom plugin APIs
- Community plugin integrations

### Sync Mechanisms
- Cloud sync operations
- Conflict resolution
- Version history management
- Cross-device synchronization

## Cross-Platform Coordination

### 1. Task Synchronization
- Mapping tasks between systems
- Status alignment across platforms
- Deadline and priority synchronization
- Assignment and ownership tracking

### 2. Data Consistency
- Schema mapping between systems
- Data transformation and normalization
- Conflict resolution strategies
- Audit trails and change tracking

### 3. Workflow Orchestration
- Trigger-based automation
- Multi-step process coordination
- Error handling and retries
- Notification and alerting

## Security Considerations

### Authentication
- Secure token storage and rotation
- Multi-factor authentication
- Session management
- Credential validation

### Authorization
- Principle of least privilege
- Role-based access control
- Permission auditing
- Access revocation procedures

### Data Protection
- Encryption at rest and in transit
- Sensitive data identification
- Masking and anonymization
- Compliance with regulations

## Best Practices

### 1. Error Handling
- Graceful degradation when integrations fail
- Comprehensive logging for debugging
- Retry mechanisms with exponential backoff
- Circuit breakers for failing services

### 2. Performance Optimization
- Efficient querying and filtering
- Caching strategies for frequent operations
- Batch operations for bulk changes
- Rate limiting to avoid service overload

### 3. Monitoring and Observability
- Health checks for integration status
- Performance metrics and alerts
- Usage analytics and trends
- Change impact assessment

## Integration Patterns

### 1. Event-Driven Architecture
- Webhook subscriptions
- Real-time updates
- Asynchronous processing
- Decoupled system design

### 2. Polling-Based Updates
- Scheduled synchronization
- Incremental data retrieval
- Conflict detection and resolution
- Historical data backfill

### 3. Hybrid Approaches
- Combining real-time and batch processing
- Fallback mechanisms for reliability
- Load balancing across integrations
- Progressive enhancement strategies

## Troubleshooting Common Issues

### Authentication Failures
- Token expiration handling
- Permission verification
- Multi-factor authentication flows
- Account lockout scenarios

### Rate Limiting
- Adaptive request throttling
- Queue management during limits
- Exponential backoff strategies
- Alternative API endpoints

### Data Inconsistencies
- Conflict resolution algorithms
- Data validation checks
- Manual reconciliation processes
- Rollback and recovery procedures

## Hermes Mobile Integration Points

For Hermes Mobile, these integrations should be accessible through the gateway API, allowing mobile users to interact with external tools and file systems on their desktop. This enables seamless workflows between mobile and desktop environments.

The integration should maintain consistent state across platforms and provide appropriate error handling when desktop systems are unavailable.

Remember to always access external systems in compliance with their terms of service and applicable laws.