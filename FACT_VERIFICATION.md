# Fact Verification System

## Overview

BuildSheet's Fact Verification system provides a structured workflow for capturing, validating, and storing verified technical facts about components, compatibility, requirements, and procurement information. This system ensures that the AI architect has access to accurate, source-attributed knowledge that can be used to improve design decisions and reduce errors.

## How It Works

The fact verification workflow follows a simple approval process:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │   System     │     │   Admin      │     │   Firestore  │
│  Submits     │────▶│  Stores as   │────▶│  Reviews &   │────▶│  Approved    │
│  Correction  │     │  'pending'   │     │  Approves    │     │  Facts       │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                     │
                                                                     ▼
                                                            ┌──────────────────┐
                                                            │  Used by AI for  │
                                                            │  future designs  │
                                                            └──────────────────┘
```

### Workflow Steps

1. **Submission**: Users (authenticated or anonymous) submit corrections or new facts via the `/api/v1/architect/correct` endpoint
2. **Storage**: The system stores the fact with `status: 'pending'` in Firestore
3. **Review**: Admins review pending corrections via the `/api/v1/admin/corrections` endpoint
4. **Approval/Rejection**: Admins approve or reject corrections via `/api/v1/admin/corrections/approve`
5. **Usage**: Approved facts are available for AI reasoning and future design decisions

## API Endpoints

### Submit a Correction

**Endpoint**: `POST /api/v1/architect/correct`

**Authentication**: Optional (user ID attached if available)

**Request Body**:
```json
{
  "statement": "The RTX 4090 requires a minimum 850W PSU",
  "category": "requirements",
  "tags": ["gpu", "power", "nvidia"],
  "source": "user-correction"
}
```

**Fields**:
| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `statement` | Yes | string | The factual claim being submitted |
| `category` | No | string | One of: `component-specs`, `compatibility`, `requirements`, `procurement`, `general` |
| `tags` | No | string[] | Array of tags for categorization |
| `source` | No | string | One of: `user-correction`, `web-verified`, `documentation`, `admin` |

**Response**:
```json
{
  "message": "Correction submitted for review",
  "factId": "abc123xyz",
  "status": "pending"
}
```

### List Pending Corrections (Admin Only)

**Endpoint**: `GET /api/v1/admin/corrections`

**Authentication**: Required (admin access)

**Response**:
```json
{
  "corrections": [
    {
      "id": "abc123xyz",
      "category": "requirements",
      "statement": "The RTX 4090 requires a minimum 850W PSU",
      "source": "user-correction",
      "confidence": 0.5,
      "tags": ["gpu", "power", "nvidia"],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "createdBy": "user-uid-123",
      "status": "pending"
    }
  ]
}
```

### Approve/Reject a Correction (Admin Only)

**Endpoint**: `POST /api/v1/admin/corrections/approve`

**Authentication**: Required (admin access)

**Request Body**:
```json
{
  "correctionId": "abc123xyz",
  "action": "approve",
  "confidence": 0.85
}
```

**Fields**:
| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `correctionId` | Yes | string | The ID of the correction to review |
| `action` | Yes | string | Either `approve` or `reject` |
| `confidence` | No | number | Confidence score (0-1) for approved facts |

**Response**:
```json
{
  "ok": true,
  "correctionId": "abc123xyz",
  "action": "approve",
  "newStatus": "approved"
}
```

### Search Verified Facts

**Endpoint**: `POST /api/v1/architect/search-facts` (planned)

**Authentication**: Optional

**Request Body**:
```json
{
  "category": "component-specs",
  "tags": ["gpu", "nvidia"],
  "searchTerm": "power",
  "minConfidence": 0.7,
  "limit": 10
}
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_UIDS` | Yes (for admin features) | Comma-separated list of Firebase user UIDs with admin access |

**Example**:
```env
ADMIN_UIDS=admin1@example.com,admin2@example.com,abc123def456
```

**Note**: Admin UIDs are Firebase user IDs, not email addresses. You can find these in the Firebase Console under Authentication → Users.

### Firestore Schema

Facts are stored in the `verified_facts` collection with the following structure:

```typescript
interface VerifiedFact {
  factId: string;              // Unique identifier (nanoid)
  category: string;            // One of the 5 predefined categories
  statement: string;           // The factual claim
  source: string;              // Origin of the fact
  confidence: number;          // 0-1 confidence score
  tags: string[];              // Categorization tags
  createdAt: Date;             // Creation timestamp
  updatedAt: Date;             // Last modification timestamp
  createdBy?: string;          // User ID who submitted (if user-correction)
  approvedBy?: string;         // Admin user ID who approved
  status: 'pending' | 'approved' | 'rejected';
}
```

## Categories

The system supports five fact categories:

1. **component-specs**: Technical specifications of components (dimensions, power requirements, compatibility)
2. **compatibility**: Component compatibility information (what works with what)
3. **requirements**: System-level requirements (power, cooling, physical space)
4. **procurement**: Sourcing information (availability, pricing, lead times)
5. **general**: General technical knowledge that doesn't fit other categories

## Source Types

- **user-correction**: Submitted by users via the correction form
- **web-verified**: Verified through web search and external sources
- **documentation**: Extracted from official documentation
- **admin**: Manually added by administrators

## Best Practices

### For Users Submitting Corrections

1. **Be specific**: Include exact model numbers, specifications, and conditions
2. **Provide context**: Explain why the fact is important
3. **Tag appropriately**: Use relevant tags for better discoverability
4. **Cite sources**: If possible, mention where the information came from

### For Admins Reviewing Corrections

1. **Verify accuracy**: Check official documentation or reliable sources
2. **Adjust confidence**: Set appropriate confidence based on source reliability
3. **Add context**: Consider adding additional tags or clarifying the statement
4. **Reject clearly**: When rejecting, consider providing feedback to the submitter

## Integration with AI Architect

Approved facts can be used by the AI Architect to:
- Validate component selections
- Flag potential compatibility issues
- Suggest alternative components
- Provide more accurate assembly plans
- Generate better procurement recommendations

## Testing

Unit tests for the fact verification system are located in:
- `server/src/__tests__/verifiedFactService.test.ts`

Run tests with:
```bash
cd server
npm test
```

## Future Enhancements

Planned features for the fact verification system:
- Search endpoint for querying approved facts
- Fact citation in AI responses
- Version history for fact updates
- Bulk import/export of facts
- Fact confidence decay over time
- Community voting on fact accuracy
