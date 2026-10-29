-- 075: One set of words for the client, in the portal and in notifications.
--
--   073 reworded the stages and TICKET_STATUS_LABELS_CLIENT in the app, but
--   left this function as 069 wrote it, so the same stage reached the client
--   under two names: the badge said "Client review" while the notification
--   about it said "Ready for your review".
--
--   Two stages also read backwards to a client:
--     ready_for_review is our own team checking the work, yet it was shown to
--     the client as "Ready for review", which sounds like their turn;
--     resolved is their turn -- the portal offers approve and request-changes
--     on it -- yet it read as "Resolved", as though it were already settled.
--
--   resolved and ready_for_client are the same thing to a client, so they say
--   the same thing. This must stay in step with TICKET_STATUS_LABELS_CLIENT.
-- Safe to re-run.

create or replace function public.ticket_status_label_client(p_status ticket_status) returns text
language sql immutable set search_path = public as $$
  select case p_status
    when 'ready_for_review' then 'Team review'
    when 'resolved'         then 'Ready for your approval'
    when 'ready_for_client' then 'Ready for your approval'
    else ticket_status_label(p_status)
  end
$$;
