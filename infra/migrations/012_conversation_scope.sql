-- Conversations were only separate on screen: the agent kept one memory per USER,
-- so a "New chat" still carried the previous thread's turns, and a pending
-- purchase set up in one chat could be confirmed from another.
--
-- Turns now belong to a conversation. Distilled FACTS (role='fact', written by
-- the summariser) deliberately keep a null conversation_id — those are durable
-- things about the customer and should follow them into every chat. That is the
-- split the architecture calls for: working memory is per-thread, semantic and
-- episodic knowledge is per-person.
ALTER TABLE agent_memory ADD COLUMN conversation_id TEXT;
CREATE INDEX idx_agent_memory_convo ON agent_memory(user_id, conversation_id, id DESC);
