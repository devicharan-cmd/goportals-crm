-- 076: Repair client-facing rows written before the wording and privacy fixes.
--
--   The functions were corrected in 064, 068 and 069, but the rows already
--   written were left alone. A client reading their own portal today still
--   sees all three mistakes, so this repairs the rows themselves. It changes
--   no behaviour and no function.
--
--   1. A super admin's email address is sitting in a client's notification
--      list: "TK-1004: cineplexmovieworld@gmail.com commented on ...". Staff
--      are never named to a client, so the author becomes "GoPortals team".
--      Only a title whose author segment exactly matches a staff member's own
--      name or email is touched, so a client's own name is never rewritten.
--
--   2. Status notifications written before 064 carry the raw enum word
--      ("Moved to resolved", "Moved to under review") and 069's retired
--      phrase ("Moved to Awaiting client reply"). They are re-worded to the
--      labels ticket_status_label_client() gives today, so the inbox and the
--      portal agree.
--
--   3. assignee_changed activity was client-visible until 068 flipped the
--      flag for new rows. The portal filters the old rows out of the display,
--      but they are still readable through the API, and who picked the work
--      up internally is not the client's business.
--
--   Only rows whose recipient is a client are touched.
-- Safe to re-run.

update notifications n
   set title = regexp_replace(n.title, '^(TK-\d+: ).*( commented on ")', '\1GoPortals team\2')
 where n.type = 'comment'
   and exists (select 1 from profiles r where r.id = n.recipient_id and r.role = 'client')
   and exists (
     select 1 from profiles p
     where p.role <> 'client'
       and n.title like 'TK-%: ' || coalesce(nullif(p.full_name, ''), p.email) || ' commented on "%'
   );

update notifications n
   set title = split_part(n.title, ': Moved to ', 1) || ': Moved to ' ||
     case lower(split_part(n.title, ': Moved to ', 2))
       when 'new'                    then 'New'
       when 'under review'           then 'Under review'
       when 'under_review'           then 'Under review'
       when 'awaiting client reply'  then 'Under review'
       when 'awaiting_clarification' then 'Under review'
       when 'assigned'               then 'Assigned'
       when 'in progress'            then 'In progress'
       when 'in_progress'            then 'In progress'
       when 'ready for review'       then 'Team review'
       when 'ready_for_review'       then 'Team review'
       when 'ready for client'       then 'Ready for your approval'
       when 'ready_for_client'       then 'Ready for your approval'
       when 'resolved'               then 'Ready for your approval'
       when 'reopened'               then 'Reopened'
       when 'closed'                 then 'Closed'
       else split_part(n.title, ': Moved to ', 2)
     end
 where n.title like 'TK-%: Moved to %'
   and exists (select 1 from profiles r where r.id = n.recipient_id and r.role = 'client');

update ticket_activity
   set is_client_visible = false
 where action = 'assignee_changed'
   and is_client_visible;
