var departmentTreeOpt={
	options:{
		check:{enable:true,chkStyle: "radio",radioType: "all"},
		callback:{onCheck: formTreeCheck}
	},
	$tree: null,
	init: function(callback){
		$.post("../department/list", function(departments){
			var treeNodes = [];
			for (var i = 0; i < departments.length; i++) {
				var node = {"id": departments[i].id, "name": departments[i].name, children:[]};
				if(departments[i].children && departments[i].children.length>0){
					departmentTreeOpt.buildDepartment(departments[i], node);
				}
				treeNodes.push(node);
			}
			departmentTreeOpt.$tree = $.fn.zTree.init($("#form-tree"), departmentTreeOpt.options, treeNodes);
			$("#form-dpt").on("click", function(){
				departmentTreeOpt.showFormTree();
			});
			if (callback && typeof callback == 'function') {
				callback();
			}
		});
	},
	buildDepartment: function(department, parentNode){
		for (var i = 0; i < department.children.length; i++) {
			var child = department.children[i];
			var node = {"id": child.id, "name": child.name, children: []};
			parentNode.children.push(node);
	 		if (child.children && child.children.length>0) {
	 			departmentTreeOpt.buildDepartment(child, node);
			}
		}
	},
	showFormTree: function(){
		var obj = document.getElementById("form-dpt");
		var pos = obj.getBoundingClientRect();
	    $("#form-tree-wrap").css({left:"15px", top: (obj.clientHeight+2) + "px", width:(obj.clientWidth+2) +"px"}).slideDown("fast");
	    $("html").bind("mousedown", departmentTreeOpt.onBodyDown);
	},
	hideFormTree: function(){
		$("#form-tree-wrap").fadeOut("fast");
	    $("html").unbind("mousedown", departmentTreeOpt.onBodyDown);
	},
	onBodyDown: function(event){
		if (!(event.target.id == "form-tree-wrap" || 
				event.target.id == "form-dpt" || 
				event.target.id == "form-tree" || 
				$(event.target).parents("#form-tree").length>0 )) {
			departmentTreeOpt.hideFormTree();
	    }
	}
}
function formTreeCheck(e, treeId, treeNode){
    formStaff.departmentId.value = treeNode.id;
    $("#form-dpt").val(treeNode.name);
    departmentTreeOpt.hideFormTree();
}
var staffUIOpt = {
	url:{
		validStaffEnrollid: "../staff/validStaffEnrollid",
		validStaffNumber: "../staff/validStaffNumber",
		validMobile: "../staff/validMobile",
		validIcCard: "../staff/validIcCard",
		validEmail: "../staff/validEmail"
	},	
	longid:{ 
		id: formStaff.longid.value
		},
	$validForm: null,	
	init: function(departmentId, update){
		$('.date').datetimepicker({
		    format: 'yyyy-mm-dd',
		    autoclose: true,
		    minView: 2,
		    language: i18nLanguage=='zh_CN'?'zh-CN':'en'
		});
		if (update == 'false') {
			if(formStaff.punch!=null) {
				formStaff.punch.checked = true;
			}
		}
		if (formStaff.staffDate.value == "") {
			formStaff.staffDate.value = new Date().Format("yyyy-MM-dd");
		}
		departmentTreeOpt.init(function(){
			if (departmentId) {
				var root = departmentTreeOpt.$tree.getNodesByFilter(function(node) {return node.id == departmentId}, true);
				if (root!= null) {
					departmentTreeOpt.$tree.checkNode(root, true, false, true);
				}
			} else {
				var root = departmentTreeOpt.$tree.getNodesByFilter(function(node) {return node.level == 0}, true);
				if (root!= null) {
					departmentTreeOpt.$tree.checkNode(root, true, false, true);
				}
			}
		});
		$.validator.addMethod("department",function(value,element,params){
			if (formStaff.departmentId.value == "") {
				return false;
			}
			return true;
		},"请选择所属部门");
	//	var data = [[${NEEDSMS}]]; 
	  
      
		staffUIOpt.$validForm = $("#form-staff").validate({
			rules: {
				enrollid:{required: true, remote:{
	            	url: staffUIOpt.url.validStaffEnrollid,
	            	type: "post",
	            	data:{
	            		id: function(){return formStaff.id.value}
	            	}
	            },maxlength:staffUIOpt.longid.id},

				staffNumber:{required: true, remote:{
	            	url: staffUIOpt.url.validStaffNumber,
	            	type: "post",
	            	data:{
	            		id: function(){return formStaff.id.value}
	            	}
	            }},
	            icCard:{digits: true,  max:10000000000,remote:{
	            	url: staffUIOpt.url.validIcCard,
	            	type: "post",
	            	data:{
	            		id: function(){return formStaff.id.value}
	            	}
	            }},
	            punchPwd:{digits:true, max:100000000},
		        name: {required: true},
		        department: {required:true,  department: true},
		     //   if( [[${model|NEEDSMS}]]==1){}
		        mobile: {remote:{
	            	url: staffUIOpt.url.validMobile,
	            	type: "post",
	            	data:{
	            		id: function(){return formStaff.id.value}
	            	}}
		        },
		        email: {remote:{
	            	url: staffUIOpt.url.validEmail,
	            	type: "post",
	            	data:{
	            		id: function(){return formStaff.id.value}
	            	}}
		        }
		    },   
		    messages: {  
		    	enrollid: {required: jQuery.i18n.prop("staff.enrollid.required"), remote: jQuery.i18n.prop("staff.enrollid.remote"),max:jQuery.i18n.prop("staff.enrollId.max")},
		    	staffNumber: {required: jQuery.i18n.prop("staff.staffNumber.required"), remote: jQuery.i18n.prop("staff.staffNumber.remote")},
		        name: {required: jQuery.i18n.prop("staff.name.required")},
		        department: {required: jQuery.i18n.prop("staff.department.required"),department: jQuery.i18n.prop("staff.department.required")},
		        mobile: {remote: jQuery.i18n.prop("staff.mobile.remote")},
		        email: {remote: jQuery.i18n.prop("staff.email.remote")},
		        icCard:{digits:jQuery.i18n.prop("staff.icCard.digits"), max:jQuery.i18n.prop("staff.icCard.max"), remote: jQuery.i18n.prop("staff.icCard.remote")},
		        punchPwd:{digits:jQuery.i18n.prop("staff.punchPwd.digits"), max:jQuery.i18n.prop("staff.punchPwd.max")},
		    }
		});
	}	
}