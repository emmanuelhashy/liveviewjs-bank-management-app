import {
  createLiveView,
  error_tag,
  form_for,
  html,
  LiveViewChangeset,
  newChangesetFactory,
  SingleProcessPubSub,
  submit,
  text_input,
} from "liveviewjs";
import { nanoid } from "nanoid";
import { z } from "zod";

// Create the zod BranchSchema
const BranchSchema = z.object({
  id: z.string().default(nanoid),
  name: z.string().min(2).max(100),
  manager: z.string().min(4).max(100),
  address: z.string().min(4).max(100),
  contact: z.string().min(4).max(100),
  status: z.boolean().default(false),
});

// Infer the Branch type from the BranchSchema
type Branch = z.infer<typeof BranchSchema>;

// Branch LiveViewChangesetFactory
const branchCSF = newChangesetFactory<Branch>(BranchSchema);

// in memory data store for Branches
const branchesDB: Record<string, Branch> = {};

// Pub/Sub for publishing changes
const pubSub = new SingleProcessPubSub();

let editBranchId = "";
export const branchesLiveView = createLiveView<
  // Define the Context of the LiveView
  {
    branches: Branch[];
    changeset: LiveViewChangeset<Branch>;
    editBranchId: string | null;
  },
  // Define events that are initiated by the end-user
  | { type: "save"; name: string; manager: string }
  | { type: "validate"; name: string; manager: string, address: string, contact: string }
  | { type: "toggle-status"; id: string }
  | { type: "edit"; id: string }
  | { type: "update"; id: string }
  | { type: "delete"; id: string }
>({
  mount: (socket) => {
    if (socket.connected) {
      socket.subscribe("branches");
    }
    socket.assign({
      branches: Object.values(branchesDB),
      changeset: branchCSF({}, {}), // empty changeset
      editBranchId: null,
    });
  },

  handleEvent: (event, socket) => {
    switch (event.type) {
      case "validate":
        // validate the form data
        socket.assign({
          changeset: branchCSF({}, event, "validate"),
        });
        break;
      case "save":
        // attempt to create the branch from the form data
        const saveChangeset = branchCSF({}, event, "save");
        let changeset = saveChangeset;
        console.log("hello")
        if (saveChangeset.valid) {
          // save the branch to the in memory data store
          const newBranch = saveChangeset.data as Branch;
          branchesDB[newBranch.id] = newBranch;
          // since branch was saved, reset the changeset to empty
          changeset = branchCSF({}, {});
        }
        // update context
        socket.assign({
          branches: Object.values(branchesDB),
          changeset,
        });
        pubSub.broadcast("branches", { type: "updated" });
        break;
      case "toggle-status":
        // lookup branch by id
        const branch = branchesDB[event.id];
        if (branch) {
          // update branch
          branch.status = !branch.status;
          branchesDB[branch.id] = branch;
          // update context
          socket.assign({
            branches: Object.values(branchesDB),
          });
          pubSub.broadcast("branches", { type: "updated" });
        }
        break;
      case "edit":
        editBranchId = event.id;
        // set the editBranchId to the id of the Branch being edited
        socket.assign({
          editBranchId: event.id,
        });
        break;
      case "update":
        // attempt to edit the branch with the provided data
        const editChangeset = branchCSF(branchesDB[editBranchId], event, "save");
        if (editChangeset.valid) {
          // update the branch in the in-memory data store
          const editedBranch = editChangeset.data as Branch;
          branchesDB[editedBranch.id] = editedBranch;
          // update context
          socket.assign({
            branches: Object.values(branchesDB),
            changeset: branchCSF({}, {}),
            editBranchId: null,
          });
          pubSub.broadcast("branches", { type: "updated" });
        }
        break;
      case "delete":
        // delete the branch from the in-memory data store
        delete branchesDB[event.id];
        // update context
        socket.assign({
          branches: Object.values(branchesDB),
        });
        pubSub.broadcast("branches", { type: "updated" });
        break;
    }
  },
  handleInfo: (info, socket) => {
    if (info.type === "updated") {
      socket.assign({
        branches: Object.values(branchesDB),
      });
    }
  },

  render: (context, meta) => {
    const { changeset, branches, editBranchId } = context;
    const { csrfToken } = meta;
    return html`
      <h1 class="text-green-400 text-3xl mb-6 text-center">Cosmos Bank</h1>
      
      <div class="flex w-full justify-center">
        <div id="branchForm" class="bg-slate-100 w-[25rem] mb-8 rounded-xl p-8 bg-white">
          ${form_for<Branch>("#", csrfToken, {
      phx_submit: "save",
      phx_change: "validate",
    })}
            
          <div class="space-y-4">
            <div>
              ${text_input(changeset, "name", { placeholder: "Branch Name", className: "w-full h-8 p-2 bg-gray-100", autocomplete: "off", phx_debounce: 1000 })}
              ${error_tag(changeset, "name", { className: "text-red-500 text-sm" })}
            </div>
            <div>
              ${text_input(changeset, "manager", { placeholder: "Manager", className: "w-full h-8 p-2 bg-gray-100", autocomplete: "off", phx_debounce: 1000 })}
              ${error_tag(changeset, "manager", { className: "text-red-500 text-sm" })}
            </div>
            <div>
              ${text_input(changeset, "address", { placeholder: "Address", className: "w-full h-8 p-2 bg-gray-100", autocomplete: "off", phx_debounce: 1000 })}
              ${error_tag(changeset, "address", { className: "text-red-500 text-sm" })}
            </div>
            <div>
              ${text_input(changeset, "contact", { placeholder: "Contact", className: "w-full h-8 p-2 bg-gray-100", autocomplete: "off", phx_debounce: 1000 })}
              ${error_tag(changeset, "contact", { className: "text-red-500 text-sm" })}
            </div>
          </div>
          <div class="flex justify-center bg-blue-700 mt-8 p-2 text-white w-full rounded-md">
            ${submit("Add Branch", { phx_disable_with: "Saving..." })}
          </div>
          </form>
        </div>
      </div>
      
      <div id="branches" class="flex flex-wrap space-x-4 items-center justify-center">
      ${branches.map((branch) => renderBranch(branch, csrfToken, editBranchId))}
      </div>

      
    `;
  },
});

function renderBranch(b: Branch, csrfToken: any, editBranchId: string | null) {
  return html`
    <figure id="${b.id}" class="flex bg-slate-100 w-[30rem] mt-4 rounded-xl p-8 md:p-0 bg-white">
        <img class="w-24 h-24 md:w-48 md:h-auto  md:rounded-l-lg" src="https://media.wired.com/photos/59269cd37034dc5f91bec0f1/master/pass/GoogleMapTA.jpg" alt="" width="384" height="512">
        <div class="pt-6 md:p-8 text-center md:text-left">
          <div class="space-y-1">
            <p class="text-base font-normal">
              Branch name: ${b.name}
            </p>
            <p class="text-base font-normal">
              Address: ${b.address}
            </p>
            <p class="text-base font-normal">
              Contact: ${b.contact}
            </p>
            <p class="text-base font-normal">
              Total Staff: 24
            </p>
          </div>
          <button class="${b.status ? 'bg-red-700' : "bg-green-700"} px-4 py-1.5 rounded-md text-white" phx-click="toggle-status" phx-value-id="${b.id}" phx-disable-with="Updating...">
            ${b.status ? "Disabled" : "Activated"}
          </button>
          <div class="flex space-x-2 items-center mt-8">
            <img class="w-10 h-10 rounded-full" src="https://media.wired.com/photos/59269cd37034dc5f91bec0f1/master/pass/GoogleMapTA.jpg" alt=""/>
            <figcaption class="font-medium">
              <div class="text-sky-500 dark:text-sky-400">
              ${b.manager}
              </div>
              <div class="text-slate-700 dark:text-slate-500">
                Branch Manager
              </div>
            </figcaption>
          </div>
          ${editBranchId === b.id ? editForm(b, csrfToken) : editButton(b.id)}
        </div>
      </figure>
  `;
}

function editButton(id: string) {
  return html`
    <button class="bg-blue-700 text-white text-sm py-2 px-4 rounded-md" phx-click="edit" phx-value-id="${id}">Edit</button>
    <button class="bg-red-700 text-white text-sm py-2 px-4 rounded-md" phx-click="delete" phx-value-id="${id}" phx-disable-with="Deleting...">Delete</button>
  `;
}

function editForm(branch: Branch, csrfToken: any) {
  return html`
    ${form_for<Branch>("#", csrfToken, {
    phx_submit: "update",
  })}
      <div class="space-y-2">
        <div class="field">
          ${text_input(branchCSF({}, branch), "name", { placeholder: "name", autocomplete: "off", className: "w-full border h-8 p-2 bg-gray-100" })}
        </div>
        <div class="field">
          ${text_input(branchCSF({}, branch), "manager", { placeholder: "manager", autocomplete: "off", className: "w-full border h-8 p-2 bg-gray-100" })}
        </div>
        <div class="field">
          ${text_input(branchCSF({}, branch), "address", { placeholder: "address", autocomplete: "off", className: "w-full border h-8 p-2 bg-gray-100" })}
        </div>
        <div class="field">
          ${text_input(branchCSF({}, branch), "contact", { placeholder: "contact", autocomplete: "off", className: "w-full border h-8 p-2 bg-gray-100" })}
        </div>
        <div class="flex justify-center bg-blue-700 mt-8 p-2 text-white w-full rounded-md">
          ${submit("Update Branch", { phx_disable_with: "Updating...", phx_value_id: branch.id })}
        </div>
      </div>
    </form>
  `;
}
